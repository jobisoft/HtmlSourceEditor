/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: templates.jsm
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
description: code for embedded Ace editor, the source HTML editor.
******************************************************************************/
'use strict';

/*
Stationery.definePreference('SourceEditOptions', { type: 'json', default: {
  wordWrap: true,
  base: { f: 'monospace', fs: 10},
  theme: 'chrome',
} });

let editorCommandTable = false;
let Range = false;
let TokenIterator = false;
*/

function getEditor(win) {
  return win.ace.edit("editor");
} 

var sourceEditor = {
  initialize: async function (win = window) {
    try {
      let details = await browser.compose.getComposeDetails(tabId);
      const editor = getEditor(win);
      editor.getSession().setMode("ace/mode/html");

      let beautifiedBody = html_beautify(details.body);
      editor.setValue(beautifiedBody, -1);

      editor.setShowPrintMargin(false);
      editor.$blockScrolling = Infinity;
      editor.getSession().setTabSize(4);
      editor.getSession().setUseSoftTabs(true);
      editor.getSession().setUseWrapMode(true);


      //read preferences and set theme and options accordingly
      /*let prefs = Stationery.getPref('SourceEditOptions');
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
*/
      // enable autocompletion and snippets
      editor.setOptions({
        enableBasicAutocompletion: true,
        enableSnippets: true,
        enableLiveAutocompletion: false
      });

      //windows version
      //todo: handle linux / Mac !
      editor.commands.addCommand({
        name: 'findnext',
        bindKey: { win: 'Ctrl-G', mac: 'Command-G' },
        exec: function (editor) { editor.findNext(); },
        multiSelectAction: "forEach",
        scrollIntoView: "center",
        readOnly: true
      });
      editor.commands.addCommand({
        name: 'findprevious',
        bindKey: { win: 'Ctrl-Shift-G', mac: 'Command-Shift-G' },
        exec: function (editor) { editor.findPrevious(); },
        multiSelectAction: "forEach",
        scrollIntoView: "center",
        readOnly: true
      });

      editor.commands.addCommand({
        name: 'find_F3_combo',
        bindKey: { win: 'F3', mac: 'F3' },
        exec: function (editor) { editor.commands.exec(!editor.getLastSearchOptions().needle ? 'find' : 'findnext', editor); },
        readOnly: true
      });

    } catch (e) { console.error(e); }
  },

  setHTML: function (html, resetUndo, win = window) {
    try {
      const editor = getEditor(win);

      let onAfterRender = editor.renderer.on("afterRender", function () {
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

  getHTML: function (win = window) {
    try {
      const editor = getEditor(win);
      return editor.getValue();
    } catch (e) { Stationery.handleException(e); return ''; }
  },

  setNotModified: function (win = window) {
    try {
      const editor = getEditor(win);
      editor.getSession()._Stationery_NotModified_Count = editor.getSession().getUndoManager().dirtyCounter;
    } catch (e) { Stationery.handleException(e); }
  },

  isModified: function (win = window) {
    try {
      const editor = getEditor(win);
      return editor.getSession()._Stationery_NotModified_Count != editor.getSession().getUndoManager().dirtyCounter
    } catch (e) { Stationery.handleException(e); return false; }
  },

  focus: function (win = window) {
    try {
      getEditor(win).focus();
    } catch (e) { Stationery.handleException(e); }
  },

  foldDataUrls: function (win = window) {
    try {
      foldAllDataUrls(getEditor(win));
    } catch (e) { Stationery.handleException(e); }
  },
};

function foldAllDataUrls(editor, startRow, endRow) {

  //todo use "tokenizerUpdate" event to  update after chanegs (paste, edits, etc)
  //todo instead calling "foldAllDataUrls", the "tokenizerUpdate" may be enough :-)


  editor.getSession().on("changeFold", function (param) {
    if (param.action == "remove"
      && param.data.range.dataUri) {
      Stationery.makeTimer().startTimeout(function () {
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
          } catch (e) { }
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

window.ace.require("ace/ext/language_tools");
Range = window.ace.require("ace/range").Range;
var TokenIterator = window.ace.require("ace/token_iterator").TokenIterator;

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
let tabId = urlParams.get("tabId");

if (tabId) {
  tabId = parseInt(tabId);

  sourceEditor.initialize(window);
  let saveBtn = window.document.getElementById("save");
  saveBtn.addEventListener("click", () => {
    let html = sourceEditor.getHTML();
    browser.compose.setComposeDetails(tabId, {
      body: html
    })
  })
} else {
  window.close();
}
