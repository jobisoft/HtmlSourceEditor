/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: stationery.jsm
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>

description: Stationery module importer
******************************************************************************/

Components.utils.import('resource://stationery/content/stationery.jsm');
Stationery.initWindow(window);
