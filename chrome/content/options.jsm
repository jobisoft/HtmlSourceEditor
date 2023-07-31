/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: options.jsm
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
description: options-related
  
******************************************************************************/
'use strict';


Components.utils.import('resource://stationery/content/stationery.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource:///modules/iteratorUtils.jsm');
Components.utils.import('resource:///modules/mailServices.js');

const EXPORTED_SYMBOLS = [];


Stationery.modules['options'] = {
  windowLoaded: function(win) {
    //define per-window event handlers and variables
    if (Stationery.isMessengerWindow(win)) {
      const tabmail = win.document.getElementById('tabmail');
      if (tabmail) {
        win.Stationery_.optionsTabType = makeTabType(win);
        tabmail.registerTabType(win.Stationery_.optionsTabType);
      }
    }
  },  
};

Stationery.optionsTab = null;
Stationery.optionsTabNotification = null;

Stationery.showOptions = function(eventOrWin) {
  let win;
  if (Stationery.isWindow(eventOrWin)) win = eventOrWin;
  if (eventOrWin && eventOrWin.view) win = eventOrWin.view;
  if (!win) {
    win = Services.wm.getMostRecentWindow(null);
    if (!win) {
      win = Services.ww.openWindow(null, 'chrome://messenger/content/messenger.xul', '_blank', 'chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar', null);
      win.addEventListener('load', Stationery.showOptions, false);  
      return;
    }
  }
  
  win.openTab('extensions.stationery.options', {} );
  win.focus();
  win.removeEventListener('load', Stationery.showOptions, false);
}

//to send notification to option tab
Stationery.notifyOptions = function(v) {
  if (!v || !v.type || !Stationery.optionsTab || !Stationery.optionsTabNotification) return;
  try {
    Stationery.optionsTabNotification(v);
  } catch (e) { Stationery.handleException(e); }
}


function makeTabType(win) {
  return {
    name: 'extensions.stationery',
    perTabPanel: 'vbox',
    modes: {
      'extensions.stationery.options': { type: 'extensions.stationery.options', maxTabs: 1 },
    },

    openTab: function(aTab, aArgs) {
      //NOTE: copied most code to open chromeTab, with changes for stationery options tab
      // First clone the page and set up the basics.
      const clone = win.document.getElementById('chromeTab').firstChild.cloneNode(true);

      clone.setAttribute('id', 'chromeTab-stationery');
      clone.setAttribute('collapsed', false);

      try {
        const toolbox = clone.firstChild;
        toolbox.removeAttribute('id', 'chromeTabToolbox-stationery');
        toolbox.setAttribute('collapsed', 'true');
        toolbox.firstChild.setAttribute('id', 'chromeTabToolbar-stationery');
      } catch(e) { } //ignore exceptions, in case if in new TB version they change toolbox

      aTab.panel.appendChild(clone);
      aTab.title = Stationery._('options.tab.title');
      win.document.getElementById('tabmail').setTabIcon(aTab, 'chrome://stationery/skin/main_icon.png');

      Stationery.optionsTab = win;
      
      // Start setting up the browser.
      aTab.browser = aTab.panel.getElementsByTagName('browser')[0];
      Stationery.setupElement(aTab.browser, { attr: [
        {name: 'oncommand', value: 'specialTabs.defaultClickHandler(event)'},
        {name: 'id', value: 'chromeTabBrowser-stationery'},
      ]});

      // Now start loading the content.
      aTab.browser.loadURI('chrome://stationery/content/options-tab.xul');
    },

    closeTab: function(aTab) {
      Stationery.optionsTabNotification = null;
      aTab.browser.destroy();
      Stationery.optionsTab = null;
    },

    saveTabState: function(aTab) { },
    showTab: function(aTab) { },
  };  
}
