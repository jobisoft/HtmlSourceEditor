/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: templates.jsm
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
description: code for embedded Ace editor, the source HTML editor.
******************************************************************************/
'use strict';

Components.utils.import('resource://stationery/content/stationery.jsm');

const EXPORTED_SYMBOLS = [];

Stationery.definePreference('SourceEditOptions', { type: 'json', default: {
  wordWrap: true,
  base: { f: 'monospace', fs: 10},
  theme: 'chrome',
} });

let editorCommandTable = false;
let Range = false;
let TokenIterator = false;


Stationery.modules['source-editor'] = {

  beforeInitWindow: function() {
    let prefs = Stationery.getPref('SourceEditOptions');
    try {
        if ('markup' in prefs || 'tag' in prefs || 'attrib' in prefs || 'attValue' in prefs || 'doctype' in prefs || 'comment' in prefs) {
            delete prefs.markup;
            delete prefs.tag;
            delete prefs.attrib;
            delete prefs.attValue;
            delete prefs.doctype;
            delete prefs.comment;
            Stationery.setPref('SourceEditOptions', prefs);
        }
    } catch(e) {
        Stationery.setPref('SourceEditOptions', {
          wordWrap: true,
          base: { f: 'monospace', fs: 10},
          theme: 'chrome',
        });
        throw e;
    }
  },
  
  initWindow: function(win) {

  if (Stationery.isSourceEditorWindow(win)) {
        win.ace.require("ace/ext/language_tools");
        Range = win.ace.require("ace/range").Range;
        TokenIterator = win.ace.require("ace/token_iterator").TokenIterator;
        
        const editor = win.ace.edit("editor");

        editor.getSession().setMode("ace/mode/html");
        editor.setValue("");

        //windows version
        //todo: handle linux / Mac !
        editor.commands.addCommand({
            name: 'findnext',
            bindKey: {win: 'Ctrl-G',  mac: 'Command-G'},
            exec: function(editor) { editor.findNext(); },
            multiSelectAction: "forEach",
            scrollIntoView: "center",
            readOnly: true
        });
        editor.commands.addCommand({
            name: 'findprevious',
            bindKey: {win: 'Ctrl-Shift-G',  mac: 'Command-Shift-G'},
            exec: function(editor) { editor.findPrevious(); },
            multiSelectAction: "forEach",
            scrollIntoView: "center",
            readOnly: true
        });

        editor.commands.addCommand({
            name: 'find_F3_combo',
            bindKey: {win: 'F3',  mac: 'F3'},
            exec: function(editor) { editor.commands.exec(!editor.getLastSearchOptions().needle ? 'find': 'findnext', editor); },
            readOnly: true
        });
    }
    
  },  

  windowLoaded: function(win) {
          
    if (Stationery.isSourceEditorWindow(win)) {
        // TODO make UNDO/redo menu work !!
        win.Stationery_.findInSourceCommand = {
          isCommandEnabled: function(aCommand, editorElement) { return true; },

          getCommandStateParams: function(aCommand, aParams, editorElement) {},
          doCommandParams: function(aCommand, aParams, editorElement) {},

          doCommand: function(aCommand, editorElement) {
            const editor = getEditor(win);
            editor.commands.exec('find', editor);
          }
        };

        win.Stationery_.findAgainInSourceCommand = {
          isCommandEnabled: function(aCommand, editorElement) {
            const editor = getEditor(win);
            return !!(editor) && !!(editor.getLastSearchOptions().needle); 
          },

          getCommandStateParams: function(aCommand, aParams, editorElement) {},
          doCommandParams: function(aCommand, aParams, editorElement) {},

          doCommand: function(aCommand, editorElement) {
            const editor = getEditor(win);
            editor.commands.exec(aCommand == 'cmd_findPrev' ? 'findprevious' : 'cmd_findNext', editor);
          }
        };

        win.Stationery_.findReplaceSourceCommand = {
          isCommandEnabled: function(aCommand, editorElement) { return true; },

          getCommandStateParams: function(aCommand, aParams, editorElement) {},
          doCommandParams: function(aCommand, aParams, editorElement) {},

          doCommand: function(aCommand, editorElement) {
            const editor = getEditor(win);
            editor.commands.exec('replace', editor);
          }
        };
        
        const controller = Components.classes['@mozilla.org/embedcomp/base-command-controller;1'].createInstance();
        const editorController = controller.QueryInterface(Components.interfaces.nsIControllerContext);
        editorController.init(null);
        editorController.setCommandContext(win);
        win.controllers.insertControllerAt(0, controller);
        
        editorCommandTable = controller.QueryInterface(Components.interfaces.nsIInterfaceRequestor).getInterface(Components.interfaces.nsIControllerCommandTable)

        editorCommandTable.registerCommand('cmd_find',          win.Stationery_.findInSourceCommand);
        editorCommandTable.registerCommand('cmd_findNext',      win.Stationery_.findAgainInSourceCommand);
        editorCommandTable.registerCommand('cmd_findPrev',      win.Stationery_.findAgainInSourceCommand);
        editorCommandTable.registerCommand('cmd_findReplace',   win.Stationery_.findReplaceSourceCommand);
    }

  },  

};
    
function getEditor(win) {
  if (Stationery.isComposerWindow(win)) {
    const iframe = win.document.getElementById('stationery-content-source-ace');
    return iframe.contentDocument.defaultView.ace.edit("editor");
  }
  if (Stationery.isOptionsWindow(win)) {
    const iframe = win.document.getElementById('stationery-content-source-ace-preview');
    return iframe.contentDocument.defaultView.ace.edit("editor");
  }
  if (Stationery.isSourceEditorWindow(win)) {
    return win.ace.edit("editor");
  }
  return false
}
  
Stationery.sourceEditor = {
  initialize: function(win) {
    try{
        const editor = getEditor(win);
        editor.setValue("", -1);
        
        //read preferences and set theme and options accordingly
        let prefs = Stationery.getPref('SourceEditOptions');
        if (typeof prefs === 'object') {
        
            editor.setShowPrintMargin(false);
            editor.$blockScrolling = Infinity;
            editor.getSession().setTabSize(4);
            editor.getSession().setUseSoftTabs(true);
            editor.getSession().setUseWrapMode(prefs.wordWrap);
            
            //set font face and size
            let editorOptions = {};
            if (typeof prefs.base === 'object') {
                if ('f' in prefs.base) editorOptions.fontFamily = prefs.base.f;
                if ('fs' in prefs.base) editorOptions.fontSize = prefs.base.fs + 'pt';
            }
            editor.setOptions(editorOptions);        
            
            //TODO
            if (!prefs.theme) {
                prefs.theme = 'chrome';
            }
            editor.setTheme("ace/theme/" + prefs.theme);
        }
        
        // enable autocompletion and snippets
        editor.setOptions({
            enableBasicAutocompletion: true,
            enableSnippets: true,
            enableLiveAutocompletion: false
        });
        
    } catch (e) { Stationery.handleException(e); }
  },    
  
  finalize: function(win) {
    try{
        const editor = getEditor(win);
        editor.setValue("", -1);
    } catch (e) { Stationery.handleException(e); }
  },    
  
  setHTML: function(win, html, resetUndo) {
    try{
        const editor = getEditor(win);

        let onAfterRender = editor.renderer.on("afterRender", function() {
            editor.renderer.off("afterRender", onAfterRender);
            let undoManager = editor.getSession().getUndoManager();
            if (resetUndo) {
                undoManager.reset();
            }
            editor.getSession()._Stationery_NotModified_Count = undoManager.dirtyCounter;
        });

        editor.setValue(html, -1);
        foldAllDataUrls(editor);
        
    } catch (e) { Stationery.handleException(e); }
  },    
  
  getHTML: function(win) {
    try{
        const editor = getEditor(win);
        return editor.getValue();
    } catch (e) { Stationery.handleException(e); return ''; }
  },    
  
  setNotModified: function(win) {
    try{
        const editor = getEditor(win);
        editor.getSession()._Stationery_NotModified_Count = editor.getSession().getUndoManager().dirtyCounter;
    } catch (e) { Stationery.handleException(e); }
  },    
  
  isModified: function(win) {
    try{
        const editor = getEditor(win);
        return editor.getSession()._Stationery_NotModified_Count != editor.getSession().getUndoManager().dirtyCounter
    } catch (e) { Stationery.handleException(e); return false; }
  },    
  focus: function(win) {
    try{
        getEditor(win).focus();
    } catch (e) { Stationery.handleException(e); }
  },    
  foldDataUrls: function(win) {
    try{
        foldAllDataUrls(getEditor(win));
    } catch (e) { Stationery.handleException(e); }
  },    
};

function foldAllDataUrls(editor, startRow, endRow) {

//todo use "tokenizerUpdate" event to  update after chanegs (paste, edits, etc)
//todo instead calling "foldAllDataUrls", the "tokenizerUpdate" may be enough :-)


    editor.getSession().on("changeFold", function(param) {
        if (param.action == "remove" 
         && param.data.range.dataUri) {
            Stationery.makeTimer().startTimeout(function() {
// let seen = [];  Stationery.debug("changeFold: remove : " + JSON.stringify(param, function(key, val) {    if (val != null && typeof val == "object") {         if (seen.indexOf(val) >= 0) {             return;         }         seen.push(val);     }     return val;}));        

                const range = param.data.range.clone();
                range.dataUri = JSON.parse(JSON.stringify(param.data.range.dataUri));

                //fold could be removed due to parent fold hid lines - in this case screen coord reange will be empty.
                if (range.toScreenRange(editor.getSession()).isEmpty()) return;

                //fold could be removed due to user edit - in this case token in the range start no longer contain "data:" string
                const iterator = new TokenIterator(editor.getSession(), range.start.row, range.start.column);
                let token = iterator.getCurrentToken();
                if (!token.value.match(/"\s*data:/i)) return;

                const wasCompacted = param.data.range.placeholder == range.dataUri.placeholder_compact;
                
                if (wasCompacted) {
                    range.placeholder = "data:";
                    range.end.row = range.start.row;
                    range.end.column = range.start.column + range.placeholder.length;
                } else {
                    range.placeholder = range.dataUri.placeholder_compact;
                    //move forward to find end of range
                    while (token = iterator.getCurrentToken()) {
                        if (token.value.match(/\s*"$/)) {
                            range.end.row = iterator.getCurrentTokenRow();
                            range.end.column = iterator.getCurrentTokenColumn() + token.value.length - 1;
                            break;
                        }
                        token = iterator.stepForward();
                    }
                }
//Stationery.debug(JSON.stringify(range));                        
                editor.getSession().addFold("", range);
            }, 1); //startTimeout
        }
    });
    

    const session = editor.getSession();
    if (!session.foldWidgets) return; // mode doesn't support folding
    endRow = endRow || session.getLength();
    startRow = startRow || 0;

    const iterator = new TokenIterator(session, startRow, 0);

    let token;
    let range = new Range(null, null, null, null);
    range.dataUri = {
        placeholder_compact: "",
    };
    while (token = iterator.getCurrentToken()) {
        if (token.type.lastIndexOf("attribute-value.xml") > -1) {
            if (range.start.row == null && token.value.match(/"\s*data:/i)) {
                range.start.row = iterator.getCurrentTokenRow();
                range.start.column = iterator.getCurrentTokenColumn() + 1;
                
                //skip first characters, to show protocol and filename, and few characters
                const matches = (/"(\s*data:.*?;(?:.*filename=.*?;)?).*/i).exec(token.value);
                range.placeholder = matches[1] + "\u2026";
                
                range.dataUri.placeholder_compact = range.placeholder;
                
            }
            if (range.start.row != null && range.end.row == null && token.value.match(/\s*"$/)) {
                range.end.row = iterator.getCurrentTokenRow();
                range.end.column = iterator.getCurrentTokenColumn() + token.value.length - 1;
                 
                if (range.end.row <= endRow && range.start.row >= startRow) {
                    try {
                        session.addFold("", range);
                    } catch(e) {}
                }
            }
        } else {
            if (range.start.row != null) {
                range = new Range(null, null, null, null);
                range.dataUri = {
                    placeholder_compact: "",
                };
            }
        }
        if (iterator.getCurrentTokenRow() > endRow) {
            break;
        }
        token = iterator.stepForward();
    }
        

};

