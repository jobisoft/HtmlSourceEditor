/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: stationery.jsm
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>

description: Main file of Stationery.

example:
Components.utils.import('resource://stationery/content/stationery.jsm');
  
******************************************************************************/
'use strict';

Components.utils.import('resource:///modules/iteratorUtils.jsm');
Components.utils.import('resource:///modules/mailServices.js');
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');

const EXPORTED_SYMBOLS = ['Stationery'];

let Stationery = {};

//for modules
Stationery.modules = {};
  
//general exception handler.
Stationery.handleException = function(e, alertMessage) {
  try {
    let message;
    if (typeof e == 'string') message = e; else message = e.message;
    Components.utils.reportError(message);

  } catch(e2){
    //unlikely, but happen while component is loaded...
    Components.utils.reportError("WARNING! Stationery.handleException() failed!\nError messages:\n" + e2.message + "\nOriginal exception:\n" + e.message);
  }
  if (alertMessage)
    Services.prompt.alert(null, 'Stationery exception', alertMessage);
}

Stationery.alert = function(message) {
  Services.prompt.alert(null, 'Stationery alert', message);
}

let debugCounter = 0;
Stationery.debug = function(message) {
  Components.utils.reportError("#" + (++debugCounter) + "#Stationery:\n" + message);
}


/////////////////////////////////////////////////////////////////////////////////////  
//code to create component instances
let xpcomComponents = {};

Stationery.RegisterXPCOM = function(interfaceName, componentString, interfaceType) {
  xpcomComponents[interfaceName] = {comStr: componentString, iface: interfaceType };
}
  
//returns new XPCOM instance
Stationery.XPCOM = function(interfaceName) {
  let o = xpcomComponents[interfaceName];
  if (!o) throw Components.Exception('Stationery.XPCOM() >> unregistred component: "' + interfaceName + '"!');
  return Components.classes[o.comStr].createInstance(o.iface);
}

// common XPCOM components
let ci = Components.interfaces;
Stationery.RegisterXPCOM('nsIScriptError', '@mozilla.org/scripterror;1', ci.nsIScriptError);
Stationery.RegisterXPCOM('nsIFilePicker', '@mozilla.org/filepicker;1', ci.nsIFilePicker);
Stationery.RegisterXPCOM('nsIFile', '@mozilla.org/file/local;1', ci.nsIFile);
Stationery.RegisterXPCOM('nsIScriptableUnicodeConverter', '@mozilla.org/intl/scriptableunicodeconverter', ci.nsIScriptableUnicodeConverter);
Stationery.RegisterXPCOM('nsITimer', '@mozilla.org/timer;1', ci.nsITimer);

Stationery.RegisterXPCOM('nsIFileInputStream', '@mozilla.org/network/file-input-stream;1', ci.nsIFileInputStream);
Stationery.RegisterXPCOM('nsIScriptableInputStream', '@mozilla.org/scriptableinputstream;1', ci.nsIScriptableInputStream);
Stationery.RegisterXPCOM('nsIConverterInputStream', '@mozilla.org/intl/converter-input-stream;1', ci.nsIConverterInputStream);
Stationery.RegisterXPCOM('nsIBinaryInputStream', '@mozilla.org/binaryinputstream;1', ci.nsIBinaryInputStream);

      
//services not imported from TB modules      
XPCOMUtils.defineLazyServiceGetter(Stationery, "fontEnumerator", "@mozilla.org/gfx/fontenumerator;1", "nsIFontEnumerator");
XPCOMUtils.defineLazyServiceGetter(Stationery, "parserUtils", "@mozilla.org/parserutils;1", "nsIParserUtils");

//one shared instance is enough
XPCOMUtils.defineLazyGetter(Stationery, "Messenger", function () { 
  return Components.classes["@mozilla.org/messenger;1"].createInstance(Components.interfaces.nsIMessenger); 
});



/////////////////////////////////////////////////////////////////////////////////////
//Do any per-window initializations/deinitialization

Stationery.onLoadWindow = function(event) {
  try {
    //event.target for 'load' is XULDocument, it's defaultView is same as global JS "window" object
    let win = event.target.defaultView;
    //loop over modules, calling its windowLoaded(win) function
      for (let key in Stationery.modules)
        if ('windowLoaded' in Stationery.modules[key])
           try {
            Stationery.modules[key].windowLoaded(win);
          } catch (e) {Stationery.handleException(e); }
  } catch (e) { Stationery.handleException(e); }
}

Stationery.onUnloadWindow = function(event) {
  try {
    //event.target for 'unload' is XULDocument, it's defaultView, is same as global JS "window" object
    let win = event.target.defaultView;
    //loop over modules, calling its releaseWindow(win) function
      for (let key in Stationery.modules)
        if ('releaseWindow' in Stationery.modules[key])
           try {
            Stationery.modules[key].releaseWindow(win);
          } catch (e) {Stationery.handleException(e); }
    //release references, for garbage collector
    delete win.Stationery_;
    delete win.Stationery;
  } catch (e) { Stationery.handleException(e); }
}

let beforeFirstWindowInit = true;
Stationery.initWindow = function(win) {
  if (beforeFirstWindowInit) {
    beforeFirstWindowInit = false;
    //loop over modules, calling its beforeInitWindow() function
    for (let key in Stationery.modules) 
      if ('beforeInitWindow' in Stationery.modules[key])
        try {
          Stationery.modules[key].beforeInitWindow();
        } catch (e) { Stationery.handleException(e); }
  }

  //make single object to hold all our variables related to window.
  //use one object to avoid polluting window namespace.
  win.Stationery_ = {};
  
  //onload initializations
  win.addEventListener('load', Stationery.onLoadWindow, false);
  //ensure uninitialize on window close
  win.addEventListener('unload', Stationery.onUnloadWindow, false);
  
  //loop over modules, calling its initWindow(win) function
  for (let key in Stationery.modules) 
    if ('initWindow' in Stationery.modules[key])
      try {
        Stationery.modules[key].initWindow(win);
      } catch (e) { Stationery.handleException(e); }
}

/////////////////////////////////////////////////////////////////////////////////////
//l10n
let l10n = Services.strings.createBundle("chrome://stationery/locale/stationery.properties");

Stationery._ = function(string) { try {
  return l10n.GetStringFromName(string);
} catch(e) { Stationery.handleException(e, string); return string; } }

Stationery._f = function(string, args) { try {
  return l10n.formatStringFromName(string, args, args.length);
} catch(e) { Stationery.handleException(e); return string; } }

/////////////////////////////////////////////////////////////////////////////////////
//OS recognition, OS dependent functions
Stationery.OSisWindows = Services.appinfo.OS.match(/^(WINNT)|(WINCE)$/i);
Stationery.OSisMasOC = Services.appinfo.OS.match(/^(Darwin)$/i);
Stationery.OSisUnix = Services.appinfo.widgetToolkit.match(/^(gtk2)|(qt)$/i);

Stationery.getFilePathSeparator = function() {
  if (Stationery.OSisWindows) return '\\'; else return '/'; 
}


/////////////////////////////////////////////////////////////////////////////////////
//Unicode conversion helpers
Stationery.toUnicode = function(charset, data) {
  let uConv = Stationery.XPCOM('nsIScriptableUnicodeConverter');
  uConv.charset = charset;
  return uConv.ConvertToUnicode(data);
}

Stationery.fromUnicode = function(charset, data) {
  let uConv = Stationery.XPCOM('nsIScriptableUnicodeConverter');
  uConv.charset = charset;
  return uConv.ConvertFromUnicode(data) + uConv.Finish()
}

/////////////////////////////////////////////////////////////////////////////////////
// "class" attribute management helpers
Stationery.hasClass = function(e,c) {return e.className.match(new RegExp('(\\s|^)'+c+'(\\s|$)'));}
Stationery.addClass = function(e,c) {if(!Stationery.hasClass(e,c))e.className+=' '+c;}
Stationery.removeClass = function(e,c) {if(Stationery.hasClass(e,c))e.className=e.className.replace(new RegExp('(\\s|^)'+c+'(\\s|$)'),' ');}


/////////////////////////////////////////////////////////////////////////////////////
// timer

Stationery.makeTimer = function() {
  return {
    nsITimer: Stationery.XPCOM('nsITimer'),
    code: null,
    
    notify: function(aTimer) {
      if (typeof this.code == 'function') 
        try { 
          let code = this.code;
          if (this.nsITimer.type == this.nsITimer.TYPE_ONE_SHOT) this.code = null;
          code(); 
        } catch (e) {Stationery.handleException(e); }
    },
        
    QueryInterface: function(aIID) {
      if (aIID.equals(Components.interfaces.nsITimerCallback) || aIID.equals(Components.interfaces.nsISupports)) return this;
      throw Components.results.NS_ERROR_NO_INTERFACE;
    },
    
    startInterval: function(code, millisec) {
      this.nsITimer.cancel();
      this.code = code;
      this.nsITimer.initWithCallback(this, millisec, this.nsITimer.TYPE_REPEATING_SLACK);
    },
    
    startTimeout: function(code, millisec) {
      this.nsITimer.cancel();
      this.code = code;
      this.nsITimer.initWithCallback(this, millisec, this.nsITimer.TYPE_ONE_SHOT);
    },
    
    cancel: function(code, millisec) {
      this.nsITimer.cancel();
      this.code = null;
    },
  };
}


/////////////////////////////////////////////////////////////////////////////////////
// window  helpers

Stationery.isWindow = function(win) { 
  return (typeof win == 'object') && ('document' in win); 
}

Stationery.getWindowType = function(win) {
  if (!Stationery.isWindow(win) || !win.document.documentElement.hasAttribute('windowtype')) return false;
  return win.document.documentElement.getAttribute('windowtype');
}

Stationery.isMessengerWindow = function(win) { return Stationery.getWindowType(win) == 'mail:3pane' }
Stationery.isComposerWindow = function(win) { return Stationery.getWindowType(win) == 'msgcompose' }
Stationery.isMessageWindow = function(win) { return Stationery.getWindowType(win) == 'mail:messageWindow' }
Stationery.isOptionsWindow = function(win) { return Stationery.getWindowType(win) == 'stationery:optionsPage' }
Stationery.isSourceEditorWindow = function(win) { return Stationery.getWindowType(win) == 'editor:source' }


/////////////////////////////////////////////////////////////////////////////////////
// event helpers
Stationery.fireEvent = function(win, eventName) {
  let event = win.document.createEvent("Events");
  event.initEvent('stationery-' + eventName, true, false);
  win.dispatchEvent(event);
}

Stationery.getURIContent = function(URI) {
  let input = Services.io.newChannel2(
    URI,
    null,
    null,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Components.interfaces.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
    Components.interfaces.nsIContentPolicy.TYPE_OTHER
  ).open();
  let stream = Stationery.XPCOM('nsIBinaryInputStream');
  stream.setInputStream(input);
  let content = stream.readBytes(input.available());
  stream.close(); 
  input.close();
  return { content: content, contentType: input.contentType };
}
   
/////////////////////////////////////////////////////////////////////////////////////

Stationery.guessContentType = function (content /*binary string*/, defaultType) {

  let c0 = content.charAt(0);
  let c1 = content.charAt(1);
  let c2 = content.charAt(2);
  let c3 = content.charAt(3);
  let c4 = content.charAt(4);
  let c5 = content.charAt(5);

  if (c0 == '\xFF' && c1 == '\xD8' && c2 == '\xFF') return 'image/jpeg';
  if (c0 == '\x89' && c1 == 'P' && c2 == 'N' && c3 == 'G' && c4 == '0D' && c4 == '0A') return 'image/png';
  if (c0 == 'G' && c1 == 'I' && c2 == 'F' && c3 == '8') return 'image/gif';
  if (c0 == 'B' && c1 == 'M') return 'image/bmp';
  if ((c0 == 'I' && c1 == 'I') || c0 == 'M' && c1 == 'M') return 'image/tiff';
  if (c0 == 'W' && c1 == 'E' && c2 == 'B' && c3 == 'P') return 'image/webp';
  
 return defaultType;
}

Stationery.waitForPromise = function (promise) {
  let done = false, success, failure;
  let thread = Components.classes["@mozilla.org/thread-manager;1"].getService().currentThread;

  promise.then(
    (resolved) => {
      done = true;
      success = resolved;
    },
    (error) => {
      done = true;
      failure = error;
    });

  while (!done) {
    try {
      thread.processNextEvent(true);
    } catch (e) {
      done = true;
    }
  }

  return {success: success, failure: failure}
}

/////////////////////////////////////////////////////////////////////////////////////
//load other modules

Components.utils.import('resource://stationery/content/prefs.jsm');
Components.utils.import('resource://stationery/content/templates.jsm');
Components.utils.import('resource://stationery/content/options.jsm');
Components.utils.import('resource://stationery/content/menu.jsm');
Components.utils.import('resource://stationery/content/composer_utils.jsm');
Components.utils.import('resource://stationery/content/source-editor.jsm');


