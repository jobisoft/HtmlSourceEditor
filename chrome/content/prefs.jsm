/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: prefs.jsm
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
description: preferences

******************************************************************************/
'use strict';

Components.utils.import('resource://stationery/content/stationery.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource:///modules/iteratorUtils.jsm');

const EXPORTED_SYMBOLS = [];


Stationery.getPref = function(name) { return getPref(name, valuesBranch); }
Stationery.setPref = function(name, value) { setPref(name, value, valuesBranch); }
Stationery.definePreference = function(prefName, v) { dp(prefName, v); }


Stationery.registerPreferenceObserver = function(prefName, observer, aHoldWeak) { valuesBranch.addObserver(prefName, observer, aHoldWeak); return observer; }
Stationery.unRegisterPreferenceObserver = function(prefName, observer) { valuesBranch.removeObserver(prefName, observer);  return observer; }

//////////////////////////////////////////////////////////////////////////////

const valuesBranch = Services.prefs.getBranch('extensions.stationery.');
const defaultsBranch = Services.prefs.getDefaultBranch('extensions.stationery.');

//main structure to hold preference descriptors
const prefs = {};

const PT_STRING = 1;
const PT_INT = 2;
const PT_BOOL = 3;
const PT_UNICODE = 4;
const PT_JSON = 5;

Stationery.RegisterXPCOM('nsISupportsString', '@mozilla.org/supports-string;1', Components.interfaces.nsISupportsString);


function isValidPrefType(name, preference, branch) {
  const existingPrefType = branch.getPrefType(name);
  if (existingPrefType == branch.PREF_INVALID) return true;
  if (preference.type == PT_BOOL) return existingPrefType == branch.PREF_BOOL;
  if (preference.type == PT_INT) return existingPrefType == branch.PREF_INT;
  return existingPrefType == branch.PREF_STRING;
}

function getPref(name, branch) {
  try {
    let preference = { type: PT_JSON, defaultValue: null };
    if (name in prefs) preference = prefs[name];
      
    if (!isValidPrefType(name, preference, branch)) branch.clearUserPref(name);

    if (branch.getPrefType(name) != branch.PREF_INVALID)
      switch (preference.type) {
        case PT_STRING: return branch.getCharPref(name);
        case PT_INT: return branch.getIntPref(name);
        case PT_BOOL: return branch.getBoolPref(name);
        case PT_UNICODE:
            try {
                return branch.getStringPref(name);
            } catch(e) {
                return branch.getComplexValue(name, Components.interfaces.nsISupportsString).data;
            }
        case PT_JSON: return JSON.parse(branch.getCharPref(name));
      }
    //else return default value
    switch (preference.type) {
      case PT_JSON: 
        return JSON.parse(JSON.stringify(preference.defaultValue));
      default:
        return preference.defaultValue;
    }
  } catch (e) { Stationery.handleException(e); }
  return null;
}

const encode_regex = /[^\u0000-\u007F]/g;
const encode_replacement = function(c) { return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); };
function setPref(name, value, branch) {
  try {
    let preference = { type: PT_JSON, defaultValue: null };
    if (name in prefs) preference = prefs[name];
    if (!isValidPrefType(name, preference, branch)) branch.clearUserPref(name);
    
    switch (preference.type) {
      case PT_STRING: branch.setCharPref(name, value); break;
      case PT_INT: branch.setIntPref(name, value); break;
      case PT_BOOL: branch.setBoolPref(name, value); break;
      case PT_JSON: 
        branch.setCharPref(name, JSON.stringify(value).replace(encode_regex, encode_replacement));
        break;
      case PT_UNICODE:
          try {
            branch.setStringPref(name, value);
          } catch(e) {
            const s = Stationery.XPCOM('nsISupportsString');
            s.data = value;
            branch.setComplexValue(name, Components.interfaces.nsISupportsString, s);
          }
      break;
    }
  } catch (e) { Stationery.handleException(e); }
}

function dp(prefName, v) {
  let preference = { type: PT_JSON, defaultValue: null };
  if ('type' in v) {
    if (v['type'].toLowerCase() == 'string') preference.type = PT_STRING;
    if (v['type'].toLowerCase() == 'int') preference.type = PT_INT;
    if (v['type'].toLowerCase() == 'bool') preference.type = PT_BOOL;
    if (v['type'].toLowerCase() == 'unicode') preference.type = PT_UNICODE;
    if (v['type'].toLowerCase() == 'json') preference.type = PT_JSON;
  }
  
  if ('default' in v) {
    if (preference.type == PT_JSON) {
      preference.defaultValue = JSON.parse(JSON.stringify(v['default']));
    } else {
      preference.defaultValue = v['default'];
    }
  }
  prefs[prefName] = preference;

  if ('default' in v) {
    setPref(prefName, preference.defaultValue, defaultsBranch);
  }
}

//one time upgrade of old 0.7 preferences.
//triggered if there is no new "extensions.stationery.Templates" preference, 

if ( valuesBranch.getPrefType('Templates') == valuesBranch.PREF_INVALID ) {
  Stationery.modules['prefs_old'] = {
    beforeInitWindow: function() {

      const oldBranch = Services.prefs.getBranch('stationery.');
        
      //just moved prefs
      ['AutomaticManagement', 'ChangeConfirmation',' ApplyStationery_New', 'ApplyStationery_MailToUrl', '', 
       'ApplyStationery_ReplyAll', 'ApplyStationery_ForwardAsAttachment', 'ApplyStationery_ForwardInline', 
       'ApplyStationery_NewsPost', 'ApplyStationery_ReplyToSender', 'ApplyStationery_ReplyToGroup', 'ApplyStationery_ReplyToSenderAndGroup', 
       'AttachMenu_ComposerChangeStationery', 'AttachMenu_StationeryOptions', 
       'AttachMenu_3paneWrite', 'AttachMenu_3paneReply', 'AttachMenu_3paneReplyAll', 'AttachMenu_3paneForward', 
       'AttachMenu_3panehdrReply', 'AttachMenu_3panehdrForward', 'AttachMenu_MsgViewWrite', 'AttachMenu_MsgViewReply', 
       'AttachMenu_MsgViewReplyAll', 'AttachMenu_MsgViewForward', 'AttachMenu_MsgViewhdrReply',
      ].forEach(function(i) { try { 
        if (oldBranch.getPrefType(i) == valuesBranch.PREF_BOOL) Stationery.setPref(i, oldBranch.getBoolPref(i));
      } catch(e) {}; });
      
      try { 
        if (oldBranch.getPrefType('DefaultSearchPath') == valuesBranch.PREF_STRING) 
          Stationery.setPref('DefaultSearchPath', oldBranch.getCharPref('DefaultSearchPath'));
      } catch(e) {};
      try { 
        if (oldBranch.getPrefType('AddresingWidget_Lines') == valuesBranch.PREF_INT) 
          Stationery.setPref('AddresingWidgetLines', oldBranch.getIntPref('AddresingWidget_Lines'));
      } catch(e) {};
      try { 
        if (oldBranch.getPrefType('TemplatesCount') == valuesBranch.PREF_INT) 
          Stationery.setPref('TemplatesCount', oldBranch.getIntPref('TemplatesCount'));
      } catch(e) {};

      //import old templates
      
      const makeAbbrevTemplateName = function (templateUrl) {
        templateUrl = templateUrl.replace('profile:///', Stationery.getFilePathSeparator());
        templateUrl = templateUrl.substring(templateUrl.lastIndexOf(Stationery.getFilePathSeparator()) + 1, templateUrl.length);
        return templateUrl.substring(0, templateUrl.lastIndexOf("."));
      }
      
      const templates = Stationery.getPref('Templates');
      let blankFound = false;
      for(let i = 0; i <= 40; i++) { try { 
        if (oldBranch.getPrefType('Template' + i) != valuesBranch.PREF_INVALID) {
          const tmp = decodeURI(oldBranch.getCharPref('Template' + i));
          if( tmp != '')
            if( (-1 != tmp.indexOf(Stationery.getFilePathSeparator())) || (tmp.substr(0, 11) == 'profile:///'))
              templates['*'].push( { type: 'file', name: makeAbbrevTemplateName(tmp), url: tmp } );
            else 
              if(!blankFound) { //add only first 'blank', rest are trash
                blankFound = true; templates['*'].push( { type: 'blank', name: Stationery._('template.blank.name'), url: 'blank' } );
              }
        }
      } catch(e) {}; }
      
      try { Stationery.setPref('Templates', templates); } catch(e) {};
      
      Stationery.templates.__loadFromPrefs_for_prefs_jsm();
      delete Stationery.templates.__loadFromPrefs_for_prefs_jsm;

    },
  }

} else {
  Stationery.modules['prefs_old'] = {
    beforeInitWindow: function() {
      delete Stationery.templates.__loadFromPrefs_for_prefs_jsm;
    },
  }
}

//define preferences

Stationery.definePreference('AutomaticManagement', { type: 'bool', default: true });
Stationery.definePreference('ChangeConfirmation', { type: 'bool', default: false });
Stationery.definePreference('ChangeTemplateWithIdentity', { type: 'bool', default: true });
Stationery.definePreference('ChangeTemplateWithIdentityConfirmation', { type: 'bool', default: true });
Stationery.definePreference('TemplatesCount', { type: 'int', default: 40 });
Stationery.definePreference('Templates', { type: 'json', default: { '*': [] } }); 
Stationery.definePreference('DefaultSearchPath', { type: 'unicode', default: '' });
Stationery.definePreference('DefaultTemplateEncoding', { type: 'string', default: 'UTF-8' });
Stationery.definePreference('AddresingWidgetLines', { type: 'int', default: 0 });
Stationery.definePreference('SourceEditEnabled', { type: 'bool', default: false } );
