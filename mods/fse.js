/* jslint node: true */
'use strict';

var MenuModule			= require('../core/menu_module.js').MenuModule;
var ViewController		= require('../core/view_controller.js').ViewController;
var ansi				= require('../core/ansi_term.js');

var async				= require('async');
var assert				= require('assert');
var _					= require('lodash');

exports.getModule	= FullScreenEditorModule;

exports.moduleInfo = {
	name	: 'Full Screen Editor (FSE)',
	desc	: 'A full screen editor/viewer',
	author	: 'NuSkooler',
};

function FullScreenEditorModule(options) {
	MenuModule.call(this, options);

	var self		= this;
	this.menuConfig	= options.menuConfig;
	this.editorType	= this.menuConfig.config.editorType;
	this.artNames	= [ 'header', 'body', 'footerEdit', 'footerEditMenu', 'footerView' ];
	
	//	:TODO: This needs to be passed in via args:
	this.editorMode	= 'edit';	//	view | edit | editMenu | 

	this.getFooterName = function(editorMode) {
		editorMode = editorMode || this.editorMode;
		return 'footer' + _.capitalize(editorMode);	//	e.g.. 'footerEditMenu'
	};

	this.getFormId = function(whatFor) {
		return {
			header			: 0,
			body			: 1,
			footerEdit		: 2,
			footerEditMenu	: 3,
			fotoerView		: 4,
		}[whatFor];
	};

	this.redrawFooter = function(options, cb) {
		async.waterfall(
			[
				function moveToFooterPosition(callback) {
					//
					//	Calculate footer staring position
					//
					//	row = (header height + body height)
					//
					//	Header: mciData.body.height
					//	Body  : We must find this in the config / theme
					//
					//	:TODO: don't hard code this -- allow footer to be themed/etc.
					self.client.term.rawWrite(ansi.goto(23, 1));
					callback(null);
				},
				function clearFooterArea(callback) {
					if(options.clear) {
						self.client.term.rawWrite(ansi.deleteLine(3));
					}
					callback(null);
				},
				function displayFooterArt(callback) {
					var footerArt = self.menuConfig.config.art[options.footerName];

					self.displayArtAsset(footerArt, function artDisplayed(err, artData) {
						callback(err, artData);
					});
				}
			],
			function complete(err, artData) {
				cb(err, artData);
			}
		);
	};

	this.switchFooter = function(cb) {
		var footerName = self.getFooterName();
	
		self.redrawFooter( { footerName : footerName, clear : true }, function artDisplayed(err, artData) {
			if(err) {
				cb(err);
				return;
			}

			var formId = self.getFormId(footerName);

			if(_.isUndefined(self.viewControllers[footerName])) {
				var menuLoadOpts = {
					callingMenu	: self,
					formId		: formId,
					mciMap		: artData.mciMap
				};

				self.addViewController(
					footerName,
					new ViewController( { client : self.client, formId : formId } )
				).loadFromMenuConfig(menuLoadOpts, function footerReady(err) {
					cb(err);
				});
			} else {
				self.viewControllers[footerName].redrawAll();
				cb(null);
			}
		});
	};

	this.initSequence = function() {
		var mciData = { };
		var art		= self.menuConfig.config.art;
		assert(_.isObject(art));

		async.series(
			[
				function beforeDisplayArt(callback) {
					self.beforeArt();
					callback(null);
				},
				function displayHeaderAndBodyArt(callback) {
					assert(_.isString(art.header));
					assert(_.isString(art.body));

					async.eachSeries( [ 'header', 'body' ], function dispArt(n, next) {
						self.displayArtAsset(art[n], function artDisplayed(err, artData) {
							mciData[n] = artData;
							next(err);
						});
					}, function complete(err) {
						callback(err);
					});
				},
				function displayFooter(callback) {
					var footerName = self.getFooterName();
					self.redrawFooter( { footerName : footerName }, function artDisplayed(err, artData) {
						mciData[footerName] = artData;
						callback(err);
					});
				},
				function afterArtDisplayed(callback) {
					self.mciReady(mciData);
					callback(null);
				}
			],
			function complete(err) {

			}
		);	
	};

	this.mciReadyHandlerNetMail = function(mciData) {

		var menuLoadOpts = { callingMenu : self	};

		async.series(
			[
				function header(callback) {
					menuLoadOpts.formId = self.getFormId('header');
					menuLoadOpts.mciMap	= mciData.header.mciMap;

					self.addViewController(
						'header', 
						new ViewController( { client : self.client, formId : menuLoadOpts.formId } )
					).loadFromMenuConfig(menuLoadOpts, function headerReady(err) {
						callback(err);
					});
				},
				function body(callback) {
					menuLoadOpts.formId	= self.getFormId('body');
					menuLoadOpts.mciMap	= mciData.body.mciMap;

					self.addViewController(
						'body',
						new ViewController( { client : self.client, formId : menuLoadOpts.formId } )
					).loadFromMenuConfig(menuLoadOpts, function bodyReady(err) {
						callback(err);
					});
				},
				function footer(callback) {
					var footerName = self.getFooterName();

					menuLoadOpts.formId = self.getFormId(footerName);
					menuLoadOpts.mciMap = mciData[footerName].mciMap;

					self.addViewController(
						footerName,
						new ViewController( { client : self.client, formId : menuLoadOpts.formId } )
					).loadFromMenuConfig(menuLoadOpts, function footerReady(err) {
						callback(err);
					});
				}
			],
			function complete(err) {
				var bodyView = self.getBodyView();
				self.updateTextEditMode(bodyView.getTextEditMode());
				self.updateEditModePosition(bodyView.getEditPosition());

				self.viewControllers.body.setFocus(false);
				self.viewControllers.header.switchFocus(1);
			}
		);		
	};

	this.getBodyView = function() {
		return self.viewControllers.body.getView(1);
	};

	this.updateEditModePosition = function(pos) {
		if('edit' === this.editorMode) {
			var posView = self.viewControllers.footerEdit.getView(1);
			if(posView) {
				self.client.term.rawWrite(ansi.savePos());
				posView.setText(_.padLeft(String(pos.row + 1), 2, '0') + ',' + _.padLeft(String(pos.col + 1), 2, '0'));
				self.client.term.rawWrite(ansi.restorePos());
			}
		}
	};

	this.updateTextEditMode = function(mode) {
		if('edit' === this.editorMode) {
			var modeView = self.viewControllers.footerEdit.getView(2);
			if(modeView) {
				self.client.term.rawWrite(ansi.savePos());
				modeView.setText('insert' === mode ? 'INS' : 'OVR');
				self.client.term.rawWrite(ansi.restorePos());	
			}
		}
	};


	this.menuMethods = {
		headerSubmit : function(formData, extraArgs) {
			self.viewControllers.header.setFocus(false);
			self.viewControllers.body.switchFocus(1);

			self.getBodyView().on('edit position', function cursorPosUpdate(pos) {
				self.updateEditModePosition(pos);
			});

			self.getBodyView().on('text edit mode', function textEditMode(mode) {
				self.updateTextEditMode(mode);
			});
		},
		editModeEscPressed : function(formData, extraArgs) {
			console.log('editorModeBefore=' + self.editorMode)
			self.editorMode = 'edit' === self.editorMode ? 'editMenu' : 'edit';
			console.log('editorModeAfter=' + self.editorMode)
			//self.editorMode = 'editMenu';
			self.switchFooter(function next(err) {
				if(err) {
					//	:TODO:... what now?
					console.log(err)
				} else {
					switch(self.editorMode) {
						case 'edit' :
							if(!_.isUndefined(self.viewControllers.footerEditMenu)) {
								self.viewControllers.footerEditMenu.setFocus(false);
							}
							self.viewControllers.body.switchFocus(1);
							break;

						case 'editMenu' :
							self.viewControllers.body.setFocus(false);
							self.viewControllers.footerEditMenu.switchFocus(1);
							break;

						default : throw new Error('Unexpected mode');
					}
					
				}
			});
		},
		editModeMenu1 : function(formData, extraArgs) {
			console.log('menu 1')
		}
	};
}

require('util').inherits(FullScreenEditorModule, MenuModule);

FullScreenEditorModule.prototype.enter = function(client) {	
	FullScreenEditorModule.super_.prototype.enter.call(this, client);
};

FullScreenEditorModule.prototype.mciReady = function(mciData) {
	this['mciReadyHandler' + _.capitalize(this.editorType)](mciData);
};

