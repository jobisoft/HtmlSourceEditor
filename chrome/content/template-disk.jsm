/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: template-disk.jsm
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
description: template handler for file:// templates

******************************************************************************/
'use strict';

Components.utils.import('resource://stationery/content/stationery.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import("resource://gre/modules/osfile.jsm");

var EXPORTED_SYMBOLS = [];

const handlerType = 'file';

Stationery.templates.registerHandler({
  type: handlerType,
  
  getTip: function(template) { 
    return Stationery._f('template.file.template.tip', [template.url]); 
  },
  
  getDisplayUrl: function(template) { 
    return templateUrlToRealFilePath(template.url);
  },

  
  //should load template, and add 'template.HTML' and/or 'template.Text' properties to template (for HTML or plainText template).
  //in case of error should set 'template.loadingError' to string describing error
  loadTemplate: function(template) { 
    //todo: currently only HTML files, in future add support for plain-text files
    readHTMLTemplateFile(template);
  },
  
  //this function should return menuitem. This item will be added to Stationery menu as root for this handler items.
  generateMenuitem: function(document, context) {
    if (context == 'options.add') 
      return Stationery.makeElement(document, 'menuitem', {
        label: Stationery._('template.file.menuitem.labelAdd'), 
        tooltip: Stationery._('template.file.menuitem.tip'),
      });
    //else  
    return Stationery.makeElement(document, 'menuitem', {
      label: Stationery._('template.file.menuitem.label'), 
      tooltip: Stationery._('template.file.menuitem.tip'),
    });
  },
  
  //called to handle click on menuitem generated in generateMenuitem 
  //return true if template should be applied (or new composer opened)
  onHandlerMenuitemCommand: function (event) {
    try {
      let template = openNewTemplate(event.view);
      let identity = event.target.getAttribute('stationery-identity-key');
      if (template) {
        Stationery.templates.setCurrent(event.target.getAttribute('stationery-identity-key'), template);        
        return true;
      }
    } catch (e) { Stationery.handleException(e); }

    //if we reach here, then user must cancelled, or exception was thrown
    return false;
  },
  
  //called to create new template of given type. 
  //ex. for disk template it will browse for template file
  //return new template, or false
  makeNewTemplate: function(window) { 
    return openNewTemplate(window);    
  },
  
  //return true if given template is duplicate of some other 
  isDuplicate: function(baseTemplate, comparedTemplate) { 
    return baseTemplate.type == comparedTemplate.type
        && baseTemplate.url == comparedTemplate.url; 
  },
  
  
  postprocess: function(template, HTMLEditor, gMsgCompose, Stationery_) {
    let basePath = template.filePath.substring(0, template.filePath.lastIndexOf(Stationery.getFilePathSeparator()) + 1);
    convertImagesUrls(HTMLEditor.rootElement.ownerDocument, basePath);
  },
});


// private utility functions 

function openNewTemplate(win) {
  let template = false;
  
  // code to open file on disk 
  let fp = Stationery.XPCOM('nsIFilePicker');
  fp.init(win, Stationery._('template.file.selectDialog.title'), fp.modeOpen);
  fp.appendFilters(fp.filterHTML);
  
  let defaultSearchPath = Stationery.getPref('DefaultSearchPath');
  if (defaultSearchPath != '') {
    if (defaultSearchPath.substr(0, 11) == 'profile:///') {
      let profileDir = Services.dirsvc.get('ProfD', Components.interfaces.nsIFile);
      profileDir.appendRelativePath(defaultSearchPath.substr(11))
      if(!profileDir.exists()) 
        profileDir.create(profileDir.DIRECTORY_TYPE, 777);
      fp.displayDirectory = profileDir;
    } else {
      let directory = Stationery.XPCOM('nsIFile');
      directory.initWithPath(defaultSearchPath);
      fp.displayDirectory = directory;
    }
  }

  let result = Stationery.waitForPromise(
    new Promise((resolve, reject) => {
      fp.open(function(result) {
        if (result == fp.returnOK) {
          try {
            resolve(Stationery.templates.makeTemplate(handlerType, makeAbbrevTemplateName(fp.file.path), filePathToTemplateUrl(fp.file.path)));
            return;
          } catch (e) {
            Stationery.handleException(e);
          }
        }
        reject(false);
      });
    })
  );
  if (result.success) {
    return result.success;
  }
  return false;
}

function templateUrlToRealFilePath(templateUrl) {
  if (templateUrl.substr(0, 11) == 'profile:///') {
    let profileDir = Services.dirsvc.get('ProfD', Components.interfaces.nsIFile);
    templateUrl = templateUrl.replace('profile:///', profileDir.path + Stationery.getFilePathSeparator());
  }
  //fix slash and back-slash to platform one  
  return templateUrl.replace(/(\/)|(\\)/ig, Stationery.getFilePathSeparator());
}

function filePathToTemplateUrl(filePath) {
  let profileDir = Services.dirsvc.get('ProfD', Components.interfaces.nsIFile);
  return filePath.replace(profileDir.path + Stationery.getFilePathSeparator(), 'profile:///');
}

function makeAbbrevTemplateName(templateUrl) {
  templateUrl = templateUrl.replace('profile:///', Stationery.getFilePathSeparator());
  templateUrl = templateUrl.substring(templateUrl.lastIndexOf(Stationery.getFilePathSeparator()) + 1, templateUrl.length);
  return templateUrl.substring(0, templateUrl.lastIndexOf("."));
}

function readHTMLTemplateFile(template) {
  try {
    template.filePath = templateUrlToRealFilePath(template.url);
    
    let is, sis;
    let file = Stationery.XPCOM('nsIFile');
    try {
      file.initWithPath(template.filePath);
      if (!file.exists()) {
        template.loadingError = Stationery._f('template.file.not.exists', [template.url])
        return;
      }

      let is = Stationery.XPCOM('nsIFileInputStream');
      is.init(file, 1, 0, null);
      let sis = Stationery.XPCOM('nsIScriptableInputStream');
      sis.init(is);
      //read header, look for BOM (byte-order-mark) characters.
      let bom = sis.read(3);
      is.seek(is.NS_SEEK_SET, 0);
      
      let bomCharset = false;
      if (bom.charCodeAt(0) == 239 && bom.charCodeAt(1) == 187 && bom.charCodeAt(2) == 191) bomCharset = 'UTF-8'; //UTF-8 BOM
      if (bom.charCodeAt(0) == 255 && bom.charCodeAt(1) == 254) bomCharset = 'UTF-16LE';  //UTF-16 LE BOM
      if (bom.charCodeAt(0) == 254 && bom.charCodeAt(1) == 255) bomCharset = 'UTF-16BE';  //UTF-16 BE BOM
      
      if (bomCharset) {
        //This is kind of Unicode encoded file, it can't be read using simple scriptableinputstream, because it contain null characters (in terms of 8-bit strings). 
        sis.close();
        //reinit "is" because sis.close(); closes "is" too
        is.init(file, 1, 0, null);
        
        sis = Stationery.XPCOM('nsIConverterInputStream');
        sis.init(is, bomCharset, is.available(), sis.DEFAULT_REPLACEMENT_CHARACTER);
        let str = {};
        while (sis.readString(-1, str) != 0) {
          template.HTML = template.HTML + str.value;
        }
        sis.close();
        
      } else {
        template.HTML = sis.readBytes(sis.available());
        sis.close();

        //looking for charset definition in file, and recode file to unicode
        //try speed up, by copying all text till </head> into a variable
        let head;
        let headEndIndex = template.HTML.indexOf('</head');
        if (headEndIndex > -1) {
          head = template.HTML.substring(0, headEndIndex);
        } else {
          head = template.HTML;
        }

        let CSet = head.match(/<\?.*xml .*encoding *= *["'](.*)["'].*\?>/i);
        if (CSet) {
          CSet = CSet[1];
        }
        else {
          CSet = head.match(/<META +HTTP-EQUIV *= *["']Content-Type["'].*CONTENT *= *["'].*; *charset= *["']?(.*?)["']?["'].*>/i);
          if (CSet) {
            CSet = CSet[1]
          } else {
            CSet = head.match(/<META +CONTENT *= *["'].*; *charset= *["']?(.*?)["']?["'].*HTTP-EQUIV *= *["']Content-Type["'].*>/i);
            if (CSet) {
              CSet = CSet[1];
            }
          }
        }
        if (!CSet) {
          CSet = Stationery.getPref('DefaultTemplateEncoding');
        }
        if (CSet) {
          template.HTML = Stationery.toUnicode(CSet, template.HTML);
        }
      }
    } catch (e) {
      Stationery.handleException(e);
      try { sis.close(); } catch (e) {}
      try { is.close(); } catch (e) {}
    }
  } catch (e) {
      Stationery.handleException(e);
  }
}

//function used to convert images urls to use data: protocol in imported templates.
function convertImagesUrls(htmlDocument, newBasePath) {
  let filePathSeparator = Stationery.getFilePathSeparator();
  
  function convertUrl(node, attrib) { //internal helper

    if(!node.hasAttribute(attrib)) return;
    //if filename is in one of special protocols, then assume it is valid and encoded.
    let filename = node.getAttribute(attrib);
    let content = false;
    //path and filename are in unicode, but TB accepts percent sign encoded url's only as UTF-8. so recode...
    filename = 'file:///' + escape(Stationery.fromUnicode('UTF-8', newBasePath + unescape(filename).replace(/\//g, filePathSeparator)))
    try {
      //try read file - if all ok, then replace src
      content = Stationery.getURIContent(filename);
      if (!content.contentType) {
        content.contentType = Stationery.guessContentType(content.content, 'image/png');
      }
      node.setAttribute(attrib, 'data:' + content.contentType + ";filename=" + encodeURIComponent(OS.Path.basename(unescape(filename))) + ';base64,' + btoa(content.content) );
    } catch (e) {
        Stationery.handleException(e);
    }
  }

  let bodyNodes = htmlDocument.getElementsByTagName('BODY');
  for (let i = 0 ; i < bodyNodes.length; i++) {
    convertUrl(bodyNodes[i], 'background');
  }

  let imgNodes = htmlDocument.getElementsByTagName('IMG');
  for (let i = 0 ; i < imgNodes.length; i++) {
    convertUrl(imgNodes[i], 'src');
  }
  
  //todo fix patchs in CSS ?
}