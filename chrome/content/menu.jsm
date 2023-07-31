/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: menu.jsm
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
description: handle dynamic menu creation and update
  
******************************************************************************/
'use strict';

/*
  todo: adopt 'handlers" idea, so any operation will get handler first, then handler will do required updates.
  
  so far we need 3 types of handlers: 
    * toolbar button, with direct menu
    * message header button, with Stationery menu in sub-menu (todo: allow direct menu, if there is no other menu)
    * composer context sub-menu

*/


Components.utils.import('resource://stationery/content/stationery.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');
Components.utils.import('resource:///modules/iteratorUtils.jsm');
Components.utils.import('resource:///modules/mailServices.js');

const EXPORTED_SYMBOLS = [];

Stationery.definePreference('AttachMenu_3paneWrite', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_3paneReply', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_3paneReplyAll', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_3paneForward', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_3panehdrReply', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_3panehdrForward', { type: 'bool', default: true } );

Stationery.definePreference('AttachMenu_MsgViewWrite', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_MsgViewReply', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_MsgViewReplyAll', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_MsgViewForward', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_MsgViewhdrReply', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_MsgViewhdrForward', { type: 'bool', default: true } );

Stationery.definePreference('AttachMenu_StationeryOptions', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_ComposerChangeStationery', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_ComposerStationeryToolbutton', { type: 'bool', default: true } );

const prefObserver = Stationery.registerPreferenceObserver('', {
  QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIObserver, Components.interfaces.nsISupportsWeakReference]),
  observe: function(aSubject, aTopic, aData) {
    // aData is the name of the pref that's been changed (relative to aSubject)
    if (aData.match(/AttachMenu_/)) updateAllStationeryMenus();
  }
}, true);


Stationery.modules['menu'] = {
  windowLoaded: function(win) {
    //define per-window event handlers and variables
    if (Stationery.isMessengerWindow(win)) {
      // "taskPopup" is parent menupopup of my "stationery-options" menu.
      // TODO: use proper location for linux/mac ?
      win.document.getElementById('taskPopup').addEventListener('popupshowing', updateStationeryOptionsMenuItem, false);
    }

    if (Stationery.isMessengerWindow(win) || Stationery.isMessageWindow(win) || Stationery.isComposerWindow(win)) {
      //general tooltip for stationery menu items
      win.document.documentElement.appendChild(Stationery.makeElement(win.document, 'tooltip', {
        id: 'stationery-menu-tooltip',
        events: [
          {name: 'popupshowing', value: Stationery.templates.onTemplateMenuitemTooltipShowing }
        ],
      }));
    }
    
    if (Stationery.isMessengerWindow(win) || Stationery.isMessageWindow(win)) {
      //todo: preference
      //todo: start only if CompactHeader detected!
      win.setInterval(function() { sanitizeToolbarBecauseOfCompactHeaderExtension(win) }, 1000);
      
      //toolbar
      initializeStationeryMenu(win, 'button-newmsg');
      initializeStationeryMenu(win, 'button-reply');
      initializeStationeryMenu(win, 'button-replyall');
      initializeStationeryMenu(win, 'button-forward');
      
      //message header bar
      initializeStationeryMenu(win, 'hdrReplyButton');
      initializeStationeryMenu(win, 'hdrReplyOnlyButton');
      initializeStationeryMenu(win, 'hdrReplyAllButton');
      initializeStationeryMenu(win, 'hdrReplyListButton');
      initializeStationeryMenu(win, 'hdrReplyToSenderButton');
      initializeStationeryMenu(win, 'hdrForwardButton');
    }
    
    if (Stationery.isComposerWindow(win)) {
      initializeStationeryMenu(win, 'msgComposeContext'); 
      initializeStationeryMenu(win, 'composeToolbar2'); 
    }
  },  

};

Stationery.updateMenusInWindow = function(win) {
  allAllStationeryBaseId.forEach(function (id) { 
    try {
      updateStationeryMenu(win, id) 
    } catch(e){ Stationery.handleException(e); }
  })
};



function sanitizeToolbarBecauseOfCompactHeaderExtension(win) {
  try {
    const headeToolbar = win.document.getElementById('header-view-toolbar');
    if (!headeToolbar) return;
    for (let i = 0; i < headeToolbar.childNodes.length; ++i) {
      const toolbarbutton = headeToolbar.childNodes[i];
      if (toolbarbutton.hasAttribute('id')) {
        const id = toolbarbutton.getAttribute('id');

        //Compact header extension collapse some of standard header toolbar buttons
        if (id=='hdrReplyButton' || id=='hdrReplyOnlyButton' || id=='hdrReplyAllButton' 
         || id=='hdrReplyListButton' || id=='hdrReplyToSenderButton' || id=='hdrForwardButton')
          toolbarbutton.removeAttribute('collapsed');
        
        //Compact header extension add copies of standard toolbar buttons into header toolbar
        if (id=='button-newmsg' || id=='button-reply' || id=='button-forward' || id=='button-replyall' || id=='button-replylist')
          toolbarbutton.parentNode.removeChild(toolbarbutton);
      }
    }
  } catch (e) { Stationery.handleException(e); }
}

function updateStationeryOptionsMenuItem(event) {
  try { 
    let doc = null;
    if (event.target) {
      doc = event.target.ownerDocument;
    } else {
      if (event.view && event.view.document) {
        doc = event.view.document;
      }
    }
    if (!doc) return;
    const menu = doc.getElementById('stationery-options');
    if (!menu) return;
    if (Stationery.getPref('AttachMenu_StationeryOptions')) {
      menu.removeAttribute('hidden');
    } else {
      menu.setAttribute('hidden', 'true');
    }
  } catch(e){ Stationery.handleException(e); }
}



//find menupopup in direct element childs.
function findMenupopup(element) {
  if (!element || !element.childNodes) return false;
  const nodes = element.childNodes;
  for (let i = 0; i < nodes.length; ++i) {
    if (nodes[i].nodeName == 'menupopup') {
      return nodes[i];
    }
  }
  return false;
}

//find menupopup in direct element childs. if there is no menupopup, then it create one, and appent it to XUL
function findOrMakeMenupopup(element) {
  if (!element || !element.childNodes) return false;
  const nodes = element.childNodes;
  for (let i = 0; i < nodes.length; ++i) {
    if (nodes[i].nodeName == 'menupopup') {
      return nodes[i];
    }
  }
  const r = Stationery.makeElement(element, 'menupopup');
  element.appendChild(r);
  return r;
}

Stationery.makeElement = function(doc, elementName, v) {
  if (!('createElement' in doc)) doc = doc.ownerDocument; 
  return Stationery.setupElement(doc.createElement('' + elementName), v);
}

Stationery.setupElement = function(element, v) {
  v = v || {};
  if ('id' in v) element.setAttribute('id', v.id);
  if ('label' in v) element.setAttribute('label', v.label);

  if ('tooltip' in v) element.tooltipText = v.tooltip;

  if ('class' in v) Stationery.addClass(element, v.class);

  if ('attr' in v) for (let a of fixIterator(v.attr)) {
    if ('remove' in a) element.removeAttribute(a.name);
    if ('value' in a) {
      if (('checkbox' in a && a.checkbox && !a.value) || (a.value === null)) {
        Stationery.setCheckboxLikeAttributeToElement(element, a.name, a.value);
      } else {
        element.setAttribute(a.name, a.value);
      }
    }
  }
  if ('events' in v) {
    for (let e of fixIterator(v.events)) {
      element.addEventListener(e.name, e.value, 'useCapture' in e ? e.useCapture : false );
    }
  }
  
  return element;
}

Stationery.enableOrDisableElement = function(element, state /*bool, true = enabled*/) {
  if (state) element.removeAttribute('disabled');
  else       element.setAttribute('disabled', 'true');
}

Stationery.setCheckboxLikeAttributeToElement = function(element, attribute, state /*bool, true = checked*/) {
  if (!state) element.removeAttribute(attribute);
  else       element.setAttribute(attribute, state);
}

Stationery.installToolbarButton = function(doc, toolbarId, id, before) {
  if (!doc.getElementById(id)) {
    const toolbar = doc.getElementById(toolbarId);

    const a = toolbar.currentSet.split(',');
    const i = before == null ? -1 : a.indexOf(before);
    if (i >= 0) {
        a.splice(i, 1, id); 
    } else {
        a.push(id);
    }
    toolbar.currentSet = a.join(',');
    toolbar.setAttribute('currentset', toolbar.currentSet);
    doc.persist(toolbar.id, 'currentset');
  }
}

Stationery.removeToolbarButton = function(doc, toolbarId, id) {
  if (doc.getElementById(id)) {
    const toolbar = doc.getElementById(toolbarId);
    
    const a = toolbar.currentSet.split(',');
    const i = a.indexOf(id);
    if (i >= 0) {
        a.splice(i, 1);
    }
    toolbar.currentSet = a.join(',');
    toolbar.setAttribute('currentset', toolbar.currentSet);
    doc.persist(toolbar.id, 'currentset');
  }
}


//return true id given menupopup have one item with ID without 'stationery-' + id string;
function menupopupHaveOneNonStationeryItem(menupopup, id) {
  const nodes = menupopup.childNodes;
  const r = new RegExp('stationery-' + id + '-.*');
  for (let i = 0; i < nodes.length; ++i) {
    const node = nodes[i];
    if (node.hasAttribute('stationery-menuitem')) continue;
    if (node.hasAttribute('id') && !node.getAttribute('id').match(r)) {
      return true;
    }
  }
  return false;
}

//lookup table
const windowType2PrefId = { 
  'mail:messageWindow': 'MsgView',
  'mail:3pane': '3pane',
  'msgcompose': 'Composer',
};

//lookup table
const IdToPrefId = {
//main toolbar
  'button-newmsg': 'Write',
  'button-reply': 'Reply',
  'button-replyall': 'ReplyAll',
  'button-forward': 'Forward',
//message header
  'hdrReplyButton': 'hdrReply',
  'hdrReplyOnlyButton': 'hdrReply',
  'hdrReplyAllButton': 'hdrReply',
  'hdrReplyListButton': 'hdrReply',
  'hdrReplyToSenderButton': 'hdrReply',
  'hdrForwardButton': 'hdrForward',
//composer
  'msgComposeContext': 'ChangeStationery',
  'composeToolbar2': 'StationeryToolbutton',
  
};


const allWindowTypes = ['mail:3pane', 'msgcompose', 'mail:messageWindow'];
const allAllStationeryBaseId = [
  'button-newmsg', 'button-reply', 'button-replyall', 'button-forward', 'msgComposeContext', 'composeToolbar2',
  'hdrReplyButton', 'hdrReplyOnlyButton', 'hdrReplyAllButton', 'hdrReplyListButton', 'hdrReplyToSenderButton', 'hdrForwardButton'
];


//check creating menu is allowed for this particular menu
function shouldAttachMenu(win, id) {
  return true == Stationery.getPref('AttachMenu_' + windowType2PrefId[Stationery.getWindowType(win)] + IdToPrefId[id]);
}

//should be called once, to create initial menu structures and events.
//exact menu will be created in popup event
function initializeStationeryMenu(win, id) {
  try {
    const doc = win.document;
    // first: check if element exists.
    const givenObject = doc.getElementById(id);
    if (!givenObject) return; //no XUL element, bail out.

    //top separator
    const topSeparator = Stationery.makeElement(doc, 'menuseparator', {
      id: 'stationery-' + id + '-separator-top'
    });
    
    //cases:
    
    if (id=='button-newmsg' || id=='button-reply' || id=='button-replyall' || id=='button-forward') {
      //main toolbar buttons.
      //note: there may be already existing popup menu, so we must use existing menupopup if possible, otherwise we create new one.
      //for this buttons, Stationery menu entries should appear directly in button menu.
      //because there may be already existing menu, we must add separator before our menu entries
      
      //NOTE: updateStationeryMenu() will make it splitt-button, if preference allow      
      
      //get menupopup
      const menupopup = findOrMakeMenupopup(givenObject);
      //assign event to refresh dummies on popup showing
      menupopup.addEventListener('popupshowing', onStationeryMenuPopup, false);
      menupopup.setAttribute('stationery-related-id', id);
      
      //assemble
      menupopup.appendChild(topSeparator);
    }
    

    if (id=='msgComposeContext') {
      //popup menu in composer <edit>
      //insert "change stationery..." menuitem into popup, and implement stationery menu as submenu
      givenObject.addEventListener('popupshowing', onStationeryMenuParentPopup, false);
      givenObject.setAttribute('stationery-related-id', id);
      //make sub-menu
      const subMenu = Stationery.makeElement(doc, 'menu', {
        id: 'stationery-' + id + '-folder', 
        label: Stationery._('composerEditorPopup.changeStationery'), 
      });
      //get menupopup
      const menupopup = findOrMakeMenupopup(subMenu);
      menupopup.setAttribute('id', 'stationery-' + id + '-menupopup');
      //assign event to refresh dummies on popup showing
      menupopup.addEventListener('popupshowing', onStationeryMenuPopup, false);
      menupopup.setAttribute('stationery-related-id', id);
      
      //assemble
      givenObject.appendChild(topSeparator);
      givenObject.appendChild(subMenu);
    }
    
    if (id=='composeToolbar2') {
      //function same as above, but as toolbar button
      //get menupopup
      
      let button = doc.getElementById('stationery-composer-change-stationery');
      if (!button) { //happen if button is not in toolbar, but in palette
        button = givenObject.parentNode.palette.querySelector('#stationery-composer-change-stationery');
      }
      const menupopup = findOrMakeMenupopup(button);
      menupopup.setAttribute('id', 'stationery-' + id + '-menupopup');
      //assign event to refresh dummies on popup showing
      menupopup.addEventListener('popupshowing', onStationeryMenuPopup, false);
      menupopup.setAttribute('stationery-related-id', id);
    }

    
    if (id=='hdrReplyButton' || id=='hdrReplyOnlyButton' || id=='hdrReplyAllButton' 
     || id=='hdrReplyListButton' || id=='hdrReplyToSenderButton' || id=='hdrForwardButton' ) {
      //message header toolbar buttons.
      //note: there may be already existing popup menu, so we must use existing menupopup if possible, otherwise we create new one.
      //for this buttons, Stationery menu entries should appear in distinct sub-menu
      //because there may be already existing menu, we must add separator before our menu entries

      //NOTE: updateStationeryMenu() will make it splitt-button, if preference allow      
      
      const parentMenupopup = findOrMakeMenupopup(givenObject);
      parentMenupopup.addEventListener('popupshowing', onStationeryMenuParentPopup, false);
      parentMenupopup.setAttribute('stationery-related-id', id);
      //make sub-menu
      const subMenu = Stationery.makeElement(doc, 'menu', {
        id: 'stationery-' + id + '-folder', 
        label: Stationery._('menu.stationerySubmenu.label'), 
      });
      //get menupopup
      const menupopup = findOrMakeMenupopup(subMenu);
      menupopup.setAttribute('id', 'stationery-' + id + '-menupopup');
      //assign event to refresh dummies on popup showing
      menupopup.addEventListener('popupshowing', onStationeryMenuPopup, false);
      menupopup.setAttribute('stationery-related-id', id);

      //assemble
      parentMenupopup.appendChild(topSeparator);
      parentMenupopup.appendChild(subMenu);
    }
   
  } catch (e) { Stationery.handleException(e); }
  updateStationeryMenu(win, id);
}

let updateAllStationeryMenusTimer = Stationery.makeTimer();
function updateAllStationeryMenus() {
  updateAllStationeryMenusTimer.startTimeout(function () { 
    allWindowTypes.forEach(function (winType) {
      for (let win of fixIterator(Services.wm.getEnumerator(winType), Components.interfaces.nsIDOMWindow)) {        
        allAllStationeryBaseId.forEach(function (id) { 
          try {
            updateStationeryMenu(win, id) 
          } catch(e){ Stationery.handleException(e); }
        })
      }
    })
  }, 500); 
}

let delayedupdateStationeryMenuTimer = Stationery.makeTimer();

function updateStationeryMenu(win, id) {
  try {
    const doc = win.document;
    // first: check if element exists.
    const givenObject = doc.getElementById(id);
    if (!givenObject) return; //no XUL element, bail out.

    //top separator
    const topSeparator = Stationery.makeElement(doc, 'menuseparator', {
      id: 'stationery-' + id + '-separator-top'
    });
    
    const showStationeryMenu = shouldAttachMenu(win, id); 
    //cases:
    
    if (id=='button-newmsg' || id=='button-reply' || id=='button-replyall' || id=='button-forward') {
      //main toolbar buttons.
      //note: there may be already existing popup menu, so we must use existing menupopup if possible, ptherwise we create new one.
      //for this buttons, Stationery menu entries should appear directly in button menu.
      //because there may be already existing menu, we must add separator before our menu entries
      
      //get menupopup
      const haveOneNonStationeryItem = menupopupHaveOneNonStationeryItem(findMenupopup(givenObject), id);

      if (showStationeryMenu || haveOneNonStationeryItem) {
        //make it a split-button with menu
        givenObject.setAttribute('type', 'menu-button');
        
        //FIX fro TB21: now when we set 'menu-button' and binding change, 'oncommand' will be assigned to internal toolbutton, 
        //so event from menu bubling up will not see it. To fix I assign proper event to external toolbutton.
        if (!givenObject.hasAttribute('oncommand')) {
          if (id=='button-reply') {
              Stationery.setupElement(givenObject, { attr: [{name: 'oncommand', value: 'MsgReplyMessage(event)'}]});
          }
          if (id=='button-replyall') {
              Stationery.setupElement(givenObject, { attr: [{name: 'oncommand', value: 'MsgReplyToAllMessage(event)'}]});
          }
          if (id=='button-forward') {
              Stationery.setupElement(givenObject, { attr: [{name: 'oncommand', value: 'MsgForwardMessage(event)'}]});
          }
        }
        
      } else {//make it normal button
        givenObject.removeAttribute('type');
      }
      
      if (topSeparator) {
          topSeparator.setAttribute('collapsed', showStationeryMenu && haveOneNonStationeryItem ? 'false' : 'true');
      }
    }

    if (id=='msgComposeContext') {
      //popup menu in composer <edit>
      const subMenu = doc.getElementById('stationery-' + id + '-folder');
      if (subMenu) subMenu.setAttribute('collapsed', showStationeryMenu ? 'false' : 'true');
      if (topSeparator) topSeparator.setAttribute('collapsed', showStationeryMenu ? 'false' : 'true');
    }

    if (id=='composeToolbar2') {
      //as above, but in toolbar
      
      if (showStationeryMenu) {
        Stationery.installToolbarButton(doc, id, 'stationery-composer-change-stationery');
        if ('templateCanBeChanged' in win.Stationery_) {
          //this button is in Composer window, so assume all Composer variable are available
          const btn = doc.getElementById('stationery-composer-change-stationery');
          if (btn) Stationery.enableOrDisableElement(btn, win.gMsgCompose.composeHTML && win.Stationery_.templateCanBeChanged);
        } else {
          delayedupdateStationeryMenuTimer.startTimeout(function () { updateStationeryMenu(win, id); }, 500); 
        }
      } else
        Stationery.removeToolbarButton(doc, id, 'stationery-composer-change-stationery');
        
    }
    
    if (id=='hdrReplyButton' || id=='hdrReplyOnlyButton' || id=='hdrReplyAllButton' 
     || id=='hdrReplyListButton' || id=='hdrReplyToSenderButton' || id=='hdrForwardButton' ) {
      //message header toolbar buttons.
      //note: there may be already existing popup menu, so we must use existing menupopup if possible, otherwise we create new one.
      //for this buttons, Stationery menu entries should appear in distinct sub-menu
      //because there may be already existing menu, we must add separator before our menu entries
      
      const haveOneNonStationeryItem = menupopupHaveOneNonStationeryItem(findMenupopup(givenObject), id);
      
      if (showStationeryMenu || haveOneNonStationeryItem) {
        //make it a split-button with menu
        givenObject.setAttribute('type', 'menu-button');
      } else {//make it normal button
        givenObject.removeAttribute('type');
      }
        
      
      const subMenu = doc.getElementById('stationery-' + id + '-folder');
      if (subMenu) subMenu.setAttribute('collapsed', showStationeryMenu ? 'false' : 'true');
      if (topSeparator) topSeparator.setAttribute('collapsed', showStationeryMenu && haveOneNonStationeryItem ? 'false' : 'true');
    }
   
  } catch (e) { Stationery.handleException(e); }
}

//should be called every time when we suspect that Stationery menu parent control may require update.
//for example when preference is changed, or initially, at window load.
function onStationeryMenuParentPopup(event) {
  try {
    const win = event.view;
    const id = event.target.getAttribute('stationery-related-id');
    if (!id) return;
    const doc = win.document; 
    
    // first: check if element exists.
    const givenObject = win.document.getElementById(id);
    if (!givenObject) return; //no XUL element, bail out.

    //cases:
    
    if (id=='msgComposeContext') {
      //popup menu in composer <editor>
      const menupopup = doc.getElementById('stationery-' + id + '-menupopup');

      //this menu is in Composer window, so assume all Composer variable are available
      const showStationeryMenu = shouldAttachMenu(win, id) && win.gMsgCompose.composeHTML && win.Stationery_.templateCanBeChanged; 

      //sub-menu
      const menu = doc.getElementById('stationery-' + id + '-folder');
      if (menu) menu.setAttribute('collapsed', showStationeryMenu ? 'false' : 'true');
      //separator
      const menuSep = doc.getElementById('stationery-' + id + '-separator-top');
      if (menuSep) menuSep.setAttribute('collapsed', showStationeryMenu ? 'false' : 'true');
      
      return; 
    }
    
    if (id=='hdrReplyButton' || id=='hdrReplyOnlyButton' || id=='hdrReplyAllButton' 
     || id=='hdrReplyListButton' || id=='hdrReplyToSenderButton' || id=='hdrForwardButton') {
      //message header toolbar buttons.

      const menupopup = doc.getElementById('stationery-' + id + '-menupopup');
      
      const showStationeryMenu = shouldAttachMenu(win, id);
      const showTopSeparator = showStationeryMenu && menupopupHaveOneNonStationeryItem(findMenupopup(givenObject), id);
      
      //sub-menu
      const menu = doc.getElementById('stationery-' + id + '-folder');
      if (menu) menu.setAttribute('collapsed', showStationeryMenu ? 'false' : 'true');
      //separator
      const menuSep = doc.getElementById('stationery-' + id + '-separator-top');
      if (menuSep) menuSep.setAttribute('collapsed', showTopSeparator ? 'false' : 'true');
      
      return; 
    }
      
  } catch (e) { Stationery.handleException(e); }
}


//should be called every time when we suspect that Stationery menu may require update.
//for example just before popup show.
function onStationeryMenuPopup(event) {
  try {
    const win = event.view;
    const identityKey = Stationery.templates.getIdentityKey(win);
    const id = event.target.getAttribute('stationery-related-id');
    const doc = win.document; //shortcut
    
    // first: check if element exists.
    const givenObject = win.document.getElementById(id);
    if (!givenObject) return; //no XUL element, bail out.
    
    let menupopup = null; //menupopup where generic code will insert Stationery menus.
    let showTopSeparator = false;

    //cases:
    
    if (id=='button-newmsg' || id=='button-reply' || id=='button-replyall' || id=='button-forward') {
      //main toolbar buttons.
      menupopup = findMenupopup(givenObject);
      showTopSeparator = menupopupHaveOneNonStationeryItem(menupopup, id);
    }
    
    if (id=='msgComposeContext' || id=='composeToolbar2') {
      //popup menu in composer <editor> or in toolbar
      menupopup = doc.getElementById('stationery-' + id + '-menupopup');
    }
    
    if (id=='hdrReplyButton' || id=='hdrReplyOnlyButton' || id=='hdrReplyAllButton' 
     || id=='hdrReplyListButton' || id=='hdrReplyToSenderButton' || id=='hdrForwardButton') {
      //message header toolbar buttons.
      menupopup = doc.getElementById('stationery-' + id + '-menupopup');
    }
    
    //end of cases, start generic procedure
    
    if (!menupopup) return;
    
    //detect filtering flag
    let flag = 'notForReply';
    if (id=='button-newmsg') flag = 'notForNewMail';
    if (id=='button-forward' || id=='hdrForwardButton') flag = 'notForForward';

    if (id=='msgComposeContext' || id=='composeToolbar2') {
       flag = win.Stationery_.compositionTypeFlag;
    }    

    //top separator, if exists
    const menuSep = doc.getElementById('stationery-' + id + '-separator-top');
    if (menuSep) menuSep.setAttribute('collapsed', String(!showTopSeparator));

    
    //delete all stationery items
    const nodesToDelete = givenObject.querySelectorAll('[stationery-menuitem]');
    for (let i = 0; i < nodesToDelete.length; ++i)
      nodesToDelete[i].parentNode.removeChild(nodesToDelete[i]);
    
    //create items
    for (let template of Stationery.templates.getTemplatesIterator(identityKey)) {
      //filter by flags
      if (Stationery.templates.haveFlag(template, flag)) continue;
    
      menupopup.appendChild(Stationery.makeElement(doc, 'menuitem', {
        label: template.name,
        attr: [
          {name: 'stationery-menuitem', value: 'true'},
          {name: 'stationery-template', value: template.uid },
          {name: 'stationery-related-id', value: id },
          {name: 'tooltip', value: 'stationery-menu-tooltip' },
        ],
        events: [
          {name: 'command', value: Stationery.templates.onTemplateMenuitemCommand }
        ],
      }));
      
    }
    menupopup.appendChild(Stationery.makeElement(doc, 'menuseparator', {
      attr: [ {name: 'stationery-menuitem', value: 'true'} ]
    }));
    
    //iterate handlers and add menus
    for (let menuitem of Stationery.templates.getHandlerMenuitemIterator(doc)) {
      menupopup.appendChild(Stationery.setupElement(menuitem, {
        attr: [
          {name: 'stationery-menuitem', value: 'true'},
          {name: 'stationery-identity-key', value: identityKey },
          {name: 'stationery-related-id', value: id },
        ],
      }) );
    }

    
  } catch (e) { Stationery.handleException(e); }
}

