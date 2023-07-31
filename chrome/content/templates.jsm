/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: templates.jsm
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
description: templates object

******************************************************************************/
'use strict';

Components.utils.import('resource://stationery/content/stationery.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource:///modules/iteratorUtils.jsm');
Components.utils.import('resource:///modules/mailServices.js');

const EXPORTED_SYMBOLS = [];

//internal data
//associative array indexed by identity key string, with '*' for global list.
//will contain sub-arrays, indexed by int, list of Template objects
let templates = {};


//temporary holder 
let onceOverride = null;

//template handlers.
//handler is responsible for various operation
//register new handler by Stationery.templates.registerHandler(handler)
const handlers = {};
const handlerTypes = [];

//any kind of fixer, postprocessors and preprocessors. 
//need to have specific function to be called in specific places.
//register new fixer by Stationery.templates.registerFixer(fixer)
// * preprocessText(template) - should use/update template.Text
// * preprocessHTML(template) - should use/update template.HTML
// * postprocess(template, HTMLEditor, gMsgCompose, Stationery_) - should use/update DOM in HTMLEditor
const fixers = [];

//elements that must exists in every template, and only elements that can exists in storage template.
//Note: once copy of template is released to user code, it can contain any other elements, as application needs
//Note: template in use most probably will contain 'uid' element, but it is not stored in prefs
const standardTemplateElements = ['type', 'name', 'url', 'flags'];

//sub-object for easier management of templates
Stationery.templates = {
  maxTemplatesCount: 40,

  //make new template
  makeTemplate: function(type, name, url) { 
    return { type: type, name: name, url: url, flags: {} }; 
  },
  
  copyTemplate: function(template) { return copyTemplate(template, 'deep'); }, //note: not used in code?
  getTemplateByUid: function(uid) { return copyTemplate(getTemplateByUid(uid), 'deep'); },
  getTemplateIdentityByUid: function(uid) { return getTemplateIdentityByUid(uid); },

  addNewTemplate: function(window, identityKey, handlerType) {
    const handler = handlers[handlerType];
    let template = handler.makeNewTemplate(window);
    if (!template) return;
    
    let dup = findDuplicate(identityKey, template);
    //discard just created template, use found duplicate instead.
    //effectively it will move existing template, instead adding new
    if (dup) {
        template = dup; 
    } else {
    //otherwise give it new ID
        template.uid = generateUid();
    }

    removeTemplateFromIdentity(identityKey, template); 
    const list = getListForIdentity(identityKey)
    list.unshift(template);
    fixSingleIdentyList(list);
    saveToPrefs();
  },

  //return current template. Should be called only once after Composer startup, then result should be cached
  //always return copy of template, so you can freely modify it
  getCurrent: function (identityKeyOrWindow, flag) {
    if (onceOverride != null) {
      const result = onceOverride;
      onceOverride = null;
      return result;
    }
  
    const list = getListForIdentity(identityKeyOrWindow);
    for (let i = 0; i < list.length; ++i) {
      const template = list[i];
      if (!st.haveFlag(template, flag))
        return copyTemplate(template, 'deep');
    }
    return copyTemplate(blankTemplate, 'deep');
  },
  
  //set current template. in case if automatic management is disabled it 
  //will only set override for first subsequent call of getCurrent()
  setCurrent: function (identityKeyOrWindow, templateOrUid) {
    //make 'clear' copy, only with standard members. also this will prevent passing objects without 
    //this standard members, and prevent us in case if somebody modify original object.

    if (!Stationery.getPref('AutomaticManagement')) {
      if (typeof templateOrUid == 'object') {
        onceOverride = copyTemplate(templateOrUid, 'clear');
      } else {
        onceOverride = copyTemplate(getTemplateByUid(templateOrUid), 'deep');
      }
      return;
    }

    let template;
    if (typeof templateOrUid == 'object') {
      template = copyTemplate(templateOrUid, 'clear');
    } else {
      template = getTemplateByUid(templateOrUid);
    }
    
    let dup = findDuplicate(identityKeyOrWindow, template);
    //discard just created template, use found duplicate instead.
    //effectively it will move existing template, instead adding new
    if (dup) template = dup; 
    
    removeTemplateFromIdentity(identityKeyOrWindow, template); 
    const list = getListForIdentity(identityKeyOrWindow);
    list.unshift(template);
    fixSingleIdentyList(list);
      
    saveToPrefs();
  },

  editedUid: function() {
    return editTemplateUid;
  },

  isEditable: function(templateOrUid) {
    if (typeof templateOrUid != 'object') {
      templateOrUid = getTemplateByUid(templateOrUid);
    }
    //todo : ask handler if template is editable
    return templateOrUid.type != 'blank';
  },
  
  enterEditmode: function(templateOrUid) {
    if (!st.isEditable(templateOrUid)) return;
    if (typeof templateOrUid == 'object') {
      editTemplateUid = templateOrUid.uid;
    } else {
      editTemplateUid = templateOrUid;
    }
    Stationery.notifyOptions({ type: 'templates.enter.edit' });
  },
  
  leaveEditmode: function() {
    leaveEditmodeImpl(true);
  },
  
  haveFlag: function (template, flag) {
    if (typeof template.flags != 'object') template.flags = {};    
    return template.flags[flag] == true;
  },
  
  onTemplatePropertyEdited: function(templateUid, propertyName, newValue) {
    const template = getTemplateByUid(templateUid);
    if (template == null || !(typeof template == 'object')) return null;
    if (typeof template.flags != 'object') template.flags = {};    

    //not editable properties
    if (propertyName == 'type' || propertyName == 'url') return null;

    //todo: allow handlers to revoke, validate or adjust edit
    //newValue = handler.onTemplatePropertyEdited(template, propName, newValue);
    
    if (propertyName.substring(0, 6) == 'flags.') {
      template.flags[propertyName.substring(6)] = newValue;
    } else {
      template[propertyName] = newValue;
    }
    
    return newValue;
  },
  
  //remove template
  remove: function (templateOrUid) {
    leaveEditmodeImpl(false);
    removeTemplateAllLists(templateOrUid);
    saveToPrefs();
  },
  
  //for list in option tab
  updateOrder: function (templateOrUid, delta) {
    if (delta == 0) return;
    
    leaveEditmodeImpl(false);
    
    let template;
    if (typeof templateOrUid == 'object') {
      template = templateOrUid;
    } else  {
      template = getTemplateByUid(templateOrUid);
    }

    for (let identityKey in templates) {
      const list = templates[identityKey];
      for (let i = 0; i < list.length; ++i)
        if (list[i].uid == template.uid) {
          let newIdx = i + delta;
          if (newIdx < 0) newIdx = 0;
          if (newIdx > list.length - 1) newIdx = list.length - 1;
          if (newIdx == i) return;
          
          list.splice(i, 1);
          list.splice(newIdx, 0, template);
          fixSingleIdentyList(list);
          saveToPrefs();
          return;
        }
    }

  },
  
  //move template, if both src and dst are in same identity
  //copy template otherwise
  handleDrop: function (srcUid, dstUid) {

    let srcIdx, srcList, dstIdx, dstList;

    for (let identityKey in templates) {
      const list = templates[identityKey];
      for (let i = list.length - 1; i >= 0; --i) {
        if (list[i].uid == srcUid) { 
          srcList = list;
          srcIdx = i;
        }
        if (list[i].uid == dstUid) { 
          dstList = list;
          dstIdx = i;
        }
      }
    }

    let template = srcList[srcIdx];
    if (srcList != dstList) { //not same identity
      template = copyTemplate(template, 'deep');
      template.uid = generateUid();
    } else {
      srcList.splice(srcIdx, 1);
    }
    dstList.splice(dstIdx, 0, template);
    
    saveToPrefs();
  },
    
  makeIdentityUseGlobalList: function (identityKey) {
    if (!(identityKey in templates)) return;
    delete templates[identityKey];
    saveToPrefs();
    Stationery.notifyOptions({ type: 'identities.removed', value: identityKey });
  },
  
  makeIdentityUseOwnList: function (identityKey) {
    if (identityKey in templates) return;
    templates[identityKey] = [];
    fixSingleIdentyList(templates[identityKey]);
    saveToPrefs();
    Stationery.notifyOptions({ type: 'identities.added', value: identityKey });
  },
  
  //return identities iterator
  //one item is { identity: nsIMsgIdentity, account: nsIMsgAccount }
  getIdentitiesIterator: function(all /*bool*/) {
    const Result = [];
    //for each account 
    for (const account of fixIterator(MailServices.accounts.accounts, Components.interfaces.nsIMsgAccount)) {
      //for each folder in account
      for (const identity of fixIterator(account.identities, Components.interfaces.nsIMsgIdentity)) {
        const idKey = identity.key;
        if ((all) || identity.key in templates) {
          Result.push({
            identity: identity,
            account: account,
          });
        }
      }
    }
          
    Result.sort(function(x,y){ 
      const a = x.identity.identityName.toUpperCase(); 
      const b = y.identity.identityName.toUpperCase(); 
      if (a > b) return 1; if (a < b) return -1; return 0; 
    });      
    
    return fixIterator(Result);   
  },
  
  isIdentityUsed: function (identityKey) { return identityKey in templates; },
  
  //return iterator to templates list for identity. mainly used to build menu
  getTemplatesIterator: function(identityKeyOrWindow) { return fixIterator(getListForIdentity(identityKeyOrWindow)); },
  
  //translate some "idenetity holders" into identity key.
  //so fat You can use:
  // string - will be taken as-is
  // DOMwindow - for composer and single message window it will take identity of message.
  //   for 3pane window it will take identity of selected message (if any), or current selected folger (if any) or default account
  getIdentityKey: function(identityKeyOrWindow) {
    let identityKey = '*';
    if (typeof identityKeyOrWindow == 'string') {
      identityKey = identityKeyOrWindow; 
    }
    // if identity is window, get current identity for it
    if (Stationery.isWindow(identityKeyOrWindow)) {
      const win = identityKeyOrWindow;

      if (Stationery.isMessengerWindow(win)) {
        //first get try default folder
        try { identityKey = win.accountManager.getFirstIdentityForServer(win.GetDefaultAccountRootFolder().server).key; } catch(e) {}
        //if there is current folder, then try use it
        if (win.gFolderDisplay.displayedFolder) {
          try { identityKey = win.accountManager.getFirstIdentityForServer(win.gFolderDisplay.displayedFolder.server).key; } catch(e) {}
        }
        //if there is selected message, then try use its folder
        if (win.gFolderDisplay.selectedMessage) {
          try { identityKey = win.accountManager.getFirstIdentityForServer(win.gFolderDisplay.selectedMessage.folder.server).key; } catch(e) {}
        }
      }
      
      if (Stationery.isMessageWindow(win)) {
        //get identity from folder of displayed message
        if (win.gFolderDisplay.selectedMessage) {
          try { identityKey = win.accountManager.getFirstIdentityForServer(win.gFolderDisplay.selectedMessage.folder.server).key; } catch(e) {}
        }
      }
      
      if (Stationery.isComposerWindow(win)) {
        //get identity key in standard way
        identityKey = win.getCurrentIdentity().key
      }
    }
    return identityKey;
  },

  registerHandler: function(handler) {
    handlerTypes.push(handler.type);
    handlers[handler.type] = handler;  
  },
  
  //iterator for handler menuitems.
  getHandlerMenuitemIterator: function(doc) { 
    const result = [];
    for (let i = 0; i < handlerTypes.length; ++i) {
      const menuitem = handlers[handlerTypes[i]].generateMenuitem(doc, 'menu');
      if (menuitem) result.push(Stationery.setupElement(menuitem, {
        attr: [ {name: 'stationery-handler-type', value: handlerTypes[i] } ],
        events: [ {name: 'command', value: Stationery.templates.onHandlerMenuitemCommand } ],
      }) );
    }
    return fixIterator(result); 
  },
   
  //iterator for handler menuitems in options tab.
  getHandlerOptionsAddMenuitemIterator: function(doc) { 
    const result = [];
    for (let i = 0; i < handlerTypes.length; ++i) {
      const menuitem = handlers[handlerTypes[i]].generateMenuitem(doc, 'options.add');
      if (menuitem) result.push(Stationery.setupElement(menuitem, {
        attr: [ {name: 'stationery-handler-type', value: handlerTypes[i] } ],
      }) );
    }
    return fixIterator(result); 
  },
  
  //return tip HMTL for given template.
  //called just before tip is shown
  getTip: function(template) {
    return handlers[template.type].getTip(template);
  },
  
  //return url (plain text) for given template.
  //called just before url is shown
  getDisplayUrl: function(template) {
    return handlers[template.type].getDisplayUrl(template);
  },
  
  //event listener for single templete items
  onTemplateMenuitemCommand: function(event) {
    try {
      if (isComposerContext(event) && !confirmChange(event)) return;
      st.setCurrent(st.getIdentityKey(event.view), event.target.getAttribute('stationery-template'));
      //in composer we must manually trigger applying
      if (isComposerContext(event)) event.view.Stationery_.ApplyTemplate(true);
    } catch (e) { Stationery.handleException(e); }
  },

  //event listener forsingle templete item tip
  onTemplateMenuitemTooltipShowing: function(event) {
    try {
      const tooltipElement = event.target;
      const html = st.getTip(getTemplateByUid(tooltipElement.triggerNode.getAttribute('stationery-template')));

      while(tooltipElement.lastChild) tooltipElement.removeChild(tooltipElement.lastChild);
      const div = Stationery.makeElement(tooltipElement, 'html:div', { attr: [ {name: 'flex', value: '1'} ] });
      tooltipElement.appendChild(div); 
      
      const parser = Stationery.parserUtils;
      const injectHTML = parser.parseFragment(html, parser.SanitizerAllowStyle, false, null, div); 
      div.appendChild(injectHTML); 
    } catch (e) { Stationery.handleException(e); }
  },
  
  //event listener for handler menu items
  onHandlerMenuitemCommand: function(event) {
    try {
      if (isComposerContext(event) && !confirmChange(event)) return;
      let applyTemplate = handlers[event.target.getAttribute('stationery-handler-type')].onHandlerMenuitemCommand(event);
      //in composer we must manually trigger applying if requested
      if (isComposerContext(event) && applyTemplate) event.view.Stationery_.ApplyTemplate(true);
      //in other cases we must stop event in case if handler did not want template loading
      if (!isComposerContext(event) && !applyTemplate) {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
      }
    } catch (e) { Stationery.handleException(e); }
  },
  
  
  //loads template from source
  //note: will modify template object!
  //note 2: Stationery.templates.getCurrent() always return copy of internal template object.
  load: function(identityKeyOrWindow, template) {
    handlers[template.type].loadTemplate(template);
  
    // if loading fail, ask user to remove template
    if ('loadingError' in template) {
      const button = Services.prompt.confirmEx(null, 'Stationery', Stationery._f('template.loading.error', [template.loadingError]),
        Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING + Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_OK + Services.prompt.BUTTON_POS_1_DEFAULT,  
        Stationery._('template.loading.error.remove'), '', '',
        null, {value: false}
      );
      if(button == 0 /*remove*/) Stationery.templates.remove(template);
      return false;
    }
    
    //preprocessing
    if ('HTML' in template) {
      for(const f of fixIterator(fixers)) {
        if ('preprocessHTML' in f) {
          try {
            f.preprocessHTML(template);
          } catch (e) { Stationery.handleException(e); }
        }
      }
    }
    if ('Text' in template) {
      for(const f of fixIterator(fixers)) {
        if ('preprocessText' in f) {
          try {
            f.preprocessText(template);
          } catch (e) { Stationery.handleException(e); }
        }
      }
    }
    
    return true;
  },
  
  postprocess: function(template, HTMLEditor, gMsgCompose, Stationery_) {
    if ('postprocess' in handlers[template.type]) {
      try {
        handlers[template.type].postprocess(template, HTMLEditor, gMsgCompose, Stationery_);
      } catch (e) { Stationery.handleException(e); }
    }
  
    for(const f of fixIterator(fixers)) {
      if ('postprocess' in f) {
        try {
          f.postprocess(template, HTMLEditor, gMsgCompose, Stationery_);
        } catch (e) { Stationery.handleException(e); }
      }
    }
  },
  
  registerFixer: function(fixer) {
    fixers.push(fixer);
  },
  
}


const st = Stationery.templates; //shortcut

//'blank' template
const blankTemplate = { type: 'blank', name: Stationery._('template.blank.name'), url: 'blank' };

let editTemplateUid = null;

//'blank' handler, and template for other handlers
st.registerHandler({
  type: blankTemplate.type,
  getTip: function(template) { return Stationery._('template.blank.tip'); },
  getDisplayUrl: function(template) { return Stationery._('template.blank.tip'); },
  
  //for meaning of 'reason' refer 'copyTemplate' function bellow
  copyTemplate: function(template, reason, result) {
    if (reason == 'store') {
      delete result.name;
      delete result.url;
    }
    
    if (reason == 'restore' || reason == 'clear') {
      result.name = blankTemplate.name;
      result.url = blankTemplate.url;
    }
  },
  
  //should load template, and add 'template.HTML' and/or 'template.Text' properties (for HTML or plainText template).
  loadTemplate: function(template) { },
  //this function should return menuitem. This item will be added to Stationery menu as root for this handler items.
  //can return null => no menu
  generateMenuitem: function(document, context) { },
  
  //called to handle click on menuitem generated in generateMenuitem 
  //return true if template should be applied (or new composer opened)
  onHandlerMenuitemCommand: function(event) { return false; },
  
  //called to create new template of given type. 
  //ex. for disk twmplate it will browse for templat file
  //retunr new template, or false
  makeNewTemplate: function(window) { return false; },
  
  //return true if given template is duplicate of some other 
  isDuplicate: function(baseTemplate, comparedTemplate) { 
    return baseTemplate.type == comparedTemplate.type; 
  },
});

st.registerFixer({preprocessHTML: function (template) { 
  //remove unneeded tags, DOCTYPE, XML header
  template.HTML = template.HTML.replace(/<\?xml(.*?)\?>|<\!DOCTYPE (.*?)>|<LINK (.*?)>|<BASE (.*?)>/ig, "")
} })

let lastUid = 10;
function generateUid() { return (++lastUid).toString(); }

//valid reasons: 
// 'deep' - copy all
// 'clear' - make "clear" copy of template, copy only required properties. Called in case when we want store outside template.
//            note that 'uid' remain unchanged, or new is generated if source have no uid.
// 'store' - make copy to stringify to prefs
// 'restore' - make copy of object readed from prefs, that will be put in "templates" array
function copyTemplate(template, reason) { 
  template = template || {};
  let result = { };
  
  if (reason == 'deep') {
    result = JSON.parse(JSON.stringify(template));
    if (!('uid' in result)) result.uid = generateUid();
  }
  
  if (reason == 'store') {
    standardTemplateElements.forEach(function(i) {
      if (i in template) {
        result[i] = template[i];
      }
    });
  }
  
  if (reason == 'restore' || reason == 'clear') {
    standardTemplateElements.forEach(function(i) {
      result[i] = '';
      if (i in template) {
        result[i] = template[i];
      }
    });
    if (reason == 'clear' && 'uid' in template) result.uid = template.uid;
    if (!('uid' in result)) result.uid = generateUid();
  }
  
  const handler = handlers[result.type];
  if ('copyTemplate' in handler) {
    handler.copyTemplate(template, reason, result);
  }
  
  return result;
};

function isComposerContext(event) {
  return event.target.hasAttribute('stationery-related-id') && (
      event.target.getAttribute('stationery-related-id') == 'msgComposeContext'
    || event.target.getAttribute('stationery-related-id') == 'composeToolbar2'
  );
}

function confirmChange(event) {
  if (!event.view.gMsgCompose.bodyModified) return true;
  if (!Stationery.getPref('ChangeConfirmation')) {
    const checkbox = { value: false };
    if (!Services.prompt.confirmCheck(event.view, 
      Stationery._('changeConfirmation.windowTitle'),
      Stationery._('changeConfirmation.description'), 
      Stationery._('changeConfirmation.label'), 
      checkbox
    )) {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      return false;
    }
    Stationery.setPref('ChangeConfirmation', checkbox.value);
  }
  return true;
} 

function getListForIdentity(identityKeyOrWindow) {
  const identityKey = st.getIdentityKey(identityKeyOrWindow);
  if (identityKey in templates) return templates[identityKey]; 
  return templates['*']; 
}

function getTemplateByUid(templateUid) {
  //search for template with this id, return first found one (there should be only one, but ...)
  //search all lists for template, then remove it
  for (const identityKey in templates) {
    const list = templates[identityKey];
    for(let i = list.length - 1; i >= 0; --i) {
      if (list[i].uid == templateUid) {
        return list[i];
      }
    }
  }
}

function getTemplateIdentityByUid(templateUid) {
  //search for template with this id, return first found one (there should be only one, but ...)
  //search all lists for template, then remove it
  for (const identityKey in templates) {
    const list = templates[identityKey];
    for(let i = list.length - 1; i >= 0; --i) {
      if (list[i].uid == templateUid) {
        return identityKey;
      }
    }
  }
}

function removeTemplateAllLists(templateOrUid) {
  const uid = (typeof templateOrUid == 'object') ? templateOrUid.uid : templateOrUid;

  //search all lists for template, then remove it
  for (const identityKey in templates) {
    const list = templates[identityKey];
    for(let i = list.length - 1; i >= 0; --i) {
      if (list[i].uid == uid) {
        list.splice(i, 1);
      }
    }
    fixSingleIdentyList(list);
  }
}

function removeTemplateFromIdentity(identityKeyOrWindow, templateOrUid) {
  const uid = (typeof templateOrUid == 'object') ? templateOrUid.uid : templateOrUid;
  const list = getListForIdentity(identityKeyOrWindow);
  for(let i = list.length - 1; i >= 0; --i) {
    if (list[i].uid == uid) {
      list.splice(i, 1);
    }
  }
}


function findDuplicate(identityKeyOrWindow, template) { 
  const handler = handlers[template.type];
  const list = getListForIdentity(identityKeyOrWindow);
  for(let i = list.length - 1; i >= 0; --i) {
    if (handler.isDuplicate(template, list[i])) {
      return list[i];
    }
  }
  return false;
}


function fixSingleIdentyList(list) {
  try {
    let countLimit = Math.min(Stationery.getPref('TemplatesCount'), st.maxTemplatesCount);
    let blankFound = false
    for(let i = 0; i < Math.min(list.length, countLimit); ++i)
      if (list[i].type == blankTemplate.type && list[i].url == blankTemplate.url) {
        if (!blankFound) {
          blankFound = true;
        } else {
          list.splice(i--, 1); //remove items over limit
        }
      }
    if (!blankFound) --countLimit; //make space for blank template
    list.splice(countLimit, 999); //remove items over limit
    if (!blankFound) list.push(copyTemplate(blankTemplate, 'deep'));
  } catch (e) { Stationery.handleException(e); }
}

function leaveEditmodeImpl(save) {
    if (editTemplateUid == null) return;
    editTemplateUid = null;
    Stationery.notifyOptions({ type: 'templates.leave.edit' });
    if (save) saveToPrefs();
}


const saveToPrefsTimer = Stationery.makeTimer();
function saveToPrefs() {
  Stationery.notifyOptions({ type: 'templates.changed' });
  
  saveToPrefsTimer.startTimeout(function () { 
    try {
      const storeable = {};
      for (let identityKey in templates) {
        storeable[identityKey] = [];
        templates[identityKey].forEach(function(template) {
          this.push(copyTemplate(template, 'store'));
        }, storeable[identityKey]);
      }
      Stationery.setPref('Templates', storeable);
    } catch (e) { Stationery.handleException(e); } 
  }, 2500); 
}

function loadFromPrefs() {
  try {
    templates = Stationery.getPref('Templates');
    for (let identityKey in templates) {
      const list = templates[identityKey];
      for (let i = list.length - 1; i >= 0; --i) {
        list[i] = copyTemplate(list[i], 'restore');
      }
    }
  } catch (e) { Stationery.handleException(e); }
  //fixes
  if (templates == null) templates = {}; 
  if (!('*' in templates)) templates['*'] = [];
  for(let identityKey in templates) {
      fixSingleIdentyList(templates[identityKey]);  
  }
}

//load template handlers
Components.utils.import('resource://stationery/content/template-disk.jsm');



//temporary public reference, to allow prefs.jsm reload list of templates after upgrading from old version.
//remove it with this old compatibility code.
Stationery.templates.__loadFromPrefs_for_prefs_jsm = function() { try { loadFromPrefs() } catch (e) {}; };

try {
  loadFromPrefs();
} catch (e) { Stationery.handleException(e); }
