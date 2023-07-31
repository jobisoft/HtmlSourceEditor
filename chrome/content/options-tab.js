/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: options-tab.js
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
description: This is JS file for options tab. 
******************************************************************************/
'use strict';

Components.utils.import('resource://stationery/content/stationery.jsm');

Components.utils.import('resource:///modules/iteratorUtils.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');
Components.utils.import('resource://gre/modules/NetUtil.jsm');
Components.utils.import('resource:///modules/mailServices.js');

Stationery.definePreference('lastCategory', { type: 'int', default: 0 } );

let syntaxPreviewSourceHTML = '<!DOCTYPE html>\n' + 
'<html>' + 
'<head></head>' + 
'  <body attribute="Attribute value">' + 
'    Plain text<br>' + 
'    <!-- Comment -->' + 
'  </body>' + 
'</html>'; 

NetUtil.asyncFetch(
  NetUtil.newChannel('chrome://stationery/locale/SyntaxPreview.html'), 
  function(is, status) {
    if (Components.isSuccessCode(status))
    try {
      syntaxPreviewSourceHTML = Stationery.toUnicode('UTF-8', NetUtil.readInputStreamToString(is, is.available()));
    } catch(e) { }
  }
);


let prefObserver_SourceEditEnabled = Stationery.registerPreferenceObserver('SourceEditEnabled', {
  QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIObserver, Components.interfaces.nsISupportsWeakReference]),
  observe: function(aSubject, aTopic, aData) {
    updateSyntaxPreviewControls();
    updateSyntaxPreview();
  }
}, true);

let prefObserver_SourceEdit = Stationery.registerPreferenceObserver('SourceEditOptions', {
  QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIObserver, Components.interfaces.nsISupportsWeakReference]),
  observe: function(aSubject, aTopic, aData) {
    updateSyntaxPreview();
  }
}, true);

window.addEventListener('load', function(event) { 
  try {
  
    let categories = document.getElementById('categories');
    categories.clearSelection();
    categories.addEventListener('select', Stationery_.onCategoriesSelect, false );
    categories.selectedIndex = Stationery.getPref('lastCategory');

    updateIdentitiesSelector('*');
    reFillTemplatesList();
    prepareAddTemplateButton();

    updateSyntaxPreview();
    updateSyntaxPreviewControls();
        
  } catch (e) { Stationery.handleException(e); }
}, false);

Stationery_.onCategoriesSelect = function(event) {
  let viewPort = document.getElementById('stationery-view-port-container');
  for (let i = 0; i < viewPort.childNodes.length; ++i) {
    let page = viewPort.childNodes[i];
    page.setAttribute('collapsed', true);
  }
   
  let categories = document.getElementById('categories');
  let page = document.getElementById(categories.selectedItem.getAttribute('page'));
  page.setAttribute('collapsed', false); 
  
  Stationery.setPref('lastCategory', categories.selectedIndex);
}

function setMenulistOrRadiogroupValue(menulistOrRadiogroup, value) {
  for (let i = 0; i < menulistOrRadiogroup.itemCount; i++) {
    if (menulistOrRadiogroup.getItemAtIndex(i).value == value) {
      menulistOrRadiogroup.selectedIndex = i;
      break;
    }
  }
}

function updateIdentitiesSelector(selectedId) {
  let idSelector = document.getElementById('stationery-identities-menulist');
  let nodes = idSelector.childNodes;
  if (!selectedId) selectedId = idSelector.value;
  let idSelectorMenupopup = document.getElementById('stationery-identities-menulist-menupopup');
  
  while(idSelectorMenupopup.firstChild) 
    idSelectorMenupopup.removeChild(idSelectorMenupopup.firstChild);

  idSelectorMenupopup.appendChild(Stationery.makeElement(document, 'menuitem', {
    label: Stationery._('options.defaultList.name'),
    attr: [ {name: 'value', value: '*'}, ],
    events: [ {name: 'command', value: Stationery_.onIdSelectorCommand }, ],
  }));
  idSelectorMenupopup.appendChild(Stationery.makeElement(document, 'menuseparator', {}));
    
  for (let idn of Stationery.templates.getIdentitiesIterator(false)) {
    idSelectorMenupopup.appendChild(Stationery.makeElement(document, 'menuitem', {
      label: idn.identity.identityName,
      attr: [ {name: 'value', value: idn.identity.key}, ],
      events: [  {name: 'command', value: Stationery_.onIdSelectorCommand }, ],
    }));
  }  
  setMenulistOrRadiogroupValue(idSelector, selectedId);
  
  Stationery.enableOrDisableElement(document.getElementById('stationery-identity-remove'), idSelector.value != '*');
}

function addNewIdentityList() {
  try {
    let selected = {};
    let items = [];
    let name2key = {}
    for (let idn of Stationery.templates.getIdentitiesIterator(true))
      if (!Stationery.templates.isIdentityUsed(idn.identity.key)) {
        items.push(idn.identity.identityName);
        name2key[idn.identity.identityName] = idn.identity.key;
      }

    if (Services.prompt.select(null, 
      Stationery._('options.addIdentityPrompt.title'), 
      Stationery._('options.addIdentityPrompt.desc'), 
      items.length, items, selected
    ))
      Stationery.templates.makeIdentityUseOwnList(name2key[items[selected.value]]);
  
  } catch (e) { Stationery.handleException(e); } 
}

function removeCurrentIdentityList() {
  try {
    let idSelector = document.getElementById('stationery-identities-menulist');
    if (idSelector.value == '*') return;
    
    if (Services.prompt.confirm(null, 
      Stationery._('options.removeIdentityPrompt.title'), 
      Stationery._f('options.removeIdentityPrompt.text', [idSelector.label])
    ))
      Stationery.templates.makeIdentityUseGlobalList(idSelector.value);
      
  } catch (e) { Stationery.handleException(e); } 
}

function onIdSelectorSelect() {
  reFillTemplatesList();

  let removeButton = document.getElementById('stationery-identity-remove');
  if (document.getElementById('stationery-identities-menulist').value == '*')
    removeButton.setAttribute('disabled', 'true');
  else
    removeButton.removeAttribute('disabled');
}

let reFillTemplatesListTimer = Stationery.makeTimer();
function reFillTemplatesList() {
  reFillTemplatesListTimer.startTimeout(function () { 
    try {
      let identityKey = document.getElementById('stationery-identities-menulist').value;

      let templatesList = document.getElementById('stationery-templates-list');
      let selectedUid = -1;
      if (templatesList.selectedIndex > -1 && templatesList.selectedItem.hasAttribute('stationery-template'))
          selectedUid = templatesList.selectedItem.getAttribute('stationery-template');
      
      while(templatesList.firstChild) 
        templatesList.removeChild(templatesList.firstChild);

      for (let template of Stationery.templates.getTemplatesIterator(identityKey)) {
        templatesList.appendChild(Stationery.makeElement(document, 'richlistitem', {
          class: 'stationery-template-item',
          attr: [
            {name: 'name', value: template.name},
            {name: 'stationery-template-type', value: template.type},
            {name: 'stationery-template-url', value: Stationery.templates.getDisplayUrl(template)},
            {name: 'stationery-template', value: template.uid },
            {name: 'stationery-for-new-mail', value: !Stationery.templates.haveFlag(template, 'notForNewMail'), checkbox: true },
            {name: 'stationery-for-reply', value: !Stationery.templates.haveFlag(template, 'notForReply'), checkbox: true },
            {name: 'stationery-for-forward', value: !Stationery.templates.haveFlag(template, 'notForForward'), checkbox: true },
            
          ],
          events: [
            {name: 'dragstart', value: Stationery_.onTemplateItemStartDrag },
            {name: 'dragover', value: Stationery_.onTemplateItemDragOver },
            {name: 'drop', value: Stationery_.onTemplateItemDragDrop },
            {name: 'dragend', value: Stationery_.onTemplateItemEndDrag },
            {name: 'dblclick', value: Stationery_.onTemplateDblClicked },
          ],
        }));
      }

      let editedUid = Stationery.templates.editedUid();
      if (selectedUid == -1 && editedUid != null)
        selectedUid = editedUid
      
      if (selectedUid > -1 )
        for (let i = 0; i < templatesList.getRowCount(); ++i) {
          let item = templatesList.getItemAtIndex(i);
          if (selectedUid == item.getAttribute('stationery-template') ) {
            templatesList.timedSelect(item, 1000);
            templatesList.ensureElementIsVisible(item);
            
            if (editedUid != null && selectedUid == editedUid) {
              Stationery.setupElement(item, {
                attr: [
                  {name: 'stationery-editmode', value: 'true'},
                ],
              });
            }
          }
        }
      
      onTemplatesListSelectionChanged();
      
    } catch (e) { Stationery.handleException(e); } 
  }, 100); 
}

Stationery_.onTemplateItemStartDrag = function(event) {
  let el = event.originalTarget;
  while (el) {
    if (el == event.target) break;
    if (el.hasAttribute('draggable') && el.getAttribute('draggable') != 'true') {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      return;
    }
    el = el.parentNode;
  }
  let richListItem = event.target;
  event.dataTransfer.setData('application/x-stationery-item-index', richListItem.parentNode.getIndexOfItem(richListItem) );
  event.dataTransfer.setData('application/x-stationery-template', richListItem.getAttribute('stationery-template') );
  event.dataTransfer.effectAllowed = 'move';
  
  let x = {};
  let y = {};
  richListItem.parentNode.scrollBoxObject.getPosition(x,y);
   event.dataTransfer.setDragImage(event.target, 
    Math.min(300, event.clientX - event.target.boxObject.x + x.value), 
    event.clientY - event.target.boxObject.y + y.value 
  );
}

Stationery_.onTemplateItemDragOver = function(event) {
  let richListItem = event.target;
  if (event.dataTransfer.types.contains('application/x-stationery-template')
   && event.dataTransfer.getData('application/x-stationery-template') != richListItem.getAttribute('stationery-template')
  ) event.preventDefault(); //allow drop
  
  let rlb = richListItem.parentNode;
  let rlbNodes = rlb.childNodes;
  for (let i = 0; i < rlbNodes.length; ++i)
    rlbNodes[i].setAttribute('drop-feedback', 'false');
    
  let diff = rlb.getIndexOfItem(richListItem) - event.dataTransfer.getData('application/x-stationery-item-index');
  if (diff < 0) richListItem.setAttribute('drop-feedback', 'top');
  if (diff > 0) richListItem.setAttribute('drop-feedback', 'bottom');
  
}

Stationery_.onTemplateItemDragDrop = function(event) {
  let richListItem = event.target;
  let rlb = richListItem.parentNode;
  rlb.selectItem(richListItem);
  Stationery.templates.handleDrop(
    event.dataTransfer.getData('application/x-stationery-template'),
    richListItem.getAttribute('stationery-template')
  );
}

Stationery_.onTemplateItemEndDrag = function(event) {
  let richListItem = event.target;
  let rlb = richListItem.parentNode;
  let rlbNodes = rlb.childNodes;
  for (let i = 0; i < rlbNodes.length; ++i)
    rlbNodes[i].setAttribute('drop-feedback', 'false');
}

Stationery_.onTemplateDblClicked = function(event) {
  let richListItem = event.target;
  Stationery.templates.enterEditmode(richListItem.getAttribute('stationery-template'));
}

Stationery.optionsTabNotification = function(v) {
  if (!v) return;
  if (!v.type) return;

  if (v.type == 'identities.added') updateIdentitiesSelector(v.value);
  if (v.type == 'identities.removed') updateIdentitiesSelector('*');
  
  if (v.type == 'templates.changed') reFillTemplatesList();
  
  if (v.type == 'templates.enter.edit') reFillTemplatesList();
  if (v.type == 'templates.leave.edit') reFillTemplatesList();
}


function updateSyntaxPreview() {
  try {
      
      Stationery.sourceEditor.initialize(window);
      Stationery.sourceEditor.setHTML(window, syntaxPreviewSourceHTML);
  } catch (e) { Stationery.handleException(e); } 
}

function updateSyntaxPreviewControls() {
  let disabled = Stationery.getPref('SourceEditEnabled') ? 'false' : 'true';
  let elements = document.getElementById('source-page').querySelectorAll('setting[pref="SourceEditOptions"]');
  for (let i = 0; i < elements.length; ++i)
    elements[i].setAttribute('disabled', disabled)
}

function addTemplateHandler(event) {
  let handlerType = event.target.getAttribute('stationery-handler-type');
  let identityKey = document.getElementById('stationery-identities-menulist').value;
  
  Stationery.templates.addNewTemplate(window, identityKey, handlerType);
}

function prepareAddTemplateButton() {
  let button = document.getElementById('stationery-button-add-template');
  let menupopup = document.getElementById('stationery-button-add-template-menupopup');
  
  //delete all old items
  for (let i = 0; i < menupopup.childNodes.length; ++i)
    menupopup.childNodes[i].parentNode.removeChild(menupopup.childNodes[i]);
  
  //iterate handlers and add menus
  for (let menuitem of Stationery.templates.getHandlerOptionsAddMenuitemIterator(document)) {
    menupopup.appendChild(Stationery.setupElement(menuitem, {
      events: [ {name: 'command', value: addTemplateHandler } ],
    }) );
  }

}

function onTemplatesListSelectionChanged() {
  let templatesList = document.getElementById('stationery-templates-list');
  let selectedIndex = templatesList.selectedIndex;
  
  let selectedTemplateUid = null;
  if (selectedIndex > -1) {
    selectedTemplateUid = templatesList.selectedItem.getAttribute('stationery-template');
    if (selectedTemplateUid != null && selectedTemplateUid != Stationery.templates.editedUid())
      Stationery.templates.leaveEditmode();
  }

  if (Stationery.templates.editedUid() == null) 
    document.getElementById('stationery-button-edit-template').setAttribute('disabled-but-visible', true);
  else
    document.getElementById('stationery-button-edit-template').removeAttribute('disabled-but-visible');
  
  Stationery.enableOrDisableElement(document.getElementById('stationery-button-up-template'), 
    selectedIndex > -1 && templatesList.selectedIndex > 0);
    
  Stationery.enableOrDisableElement(document.getElementById('stationery-button-down-template'), 
    selectedIndex > -1 && templatesList.selectedIndex < templatesList.getRowCount()-1);
  
  Stationery.enableOrDisableElement(document.getElementById('stationery-button-edit-template'), 
    selectedIndex > -1 && Stationery.templates.isEditable(selectedTemplateUid)
    && Stationery.templates.editedUid() == null);
    
  Stationery.enableOrDisableElement(document.getElementById('stationery-button-edit-template-finish'), 
    Stationery.templates.editedUid() != null);
    
  Stationery.enableOrDisableElement(document.getElementById('stationery-button-remove-template'), 
    selectedIndex > -1 && templatesList.selectedItem.getAttribute('stationery-template-type') != 'blank');
}

function moveTemplateUp() {
  let richListItem = document.getElementById('stationery-templates-list').selectedItem;
  if (!richListItem) return;
  Stationery.templates.updateOrder(richListItem.getAttribute('stationery-template'), -1);
}

function moveTemplateDown() {
  let richListItem = document.getElementById('stationery-templates-list').selectedItem;
  if (!richListItem) return;
  Stationery.templates.updateOrder(richListItem.getAttribute('stationery-template'), 1);
}

function editTemplate() {
  let richListItem = document.getElementById('stationery-templates-list').selectedItem;
  if (!richListItem) return;
  Stationery.templates.enterEditmode(richListItem.getAttribute('stationery-template'));
}

function finishEditTemplate() {
  Stationery.templates.leaveEditmode();
}

function removeTemplate() {
  let richListItem = document.getElementById('stationery-templates-list').selectedItem;
  if (!richListItem) return;
  
  if (Services.prompt.confirm(null, 
    Stationery._('options.removeTemplatePrompt.title'), 
    Stationery._('options.removeTemplatePrompt.text')
  ))
    Stationery.templates.remove(richListItem.getAttribute('stationery-template'));
}





