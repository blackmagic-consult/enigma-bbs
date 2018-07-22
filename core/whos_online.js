/* jslint node: true */
'use strict';

//  ENiGMA½
const { MenuModule }        = require('./menu_module.js');
const { getActiveNodeList } = require('./client_connections.js');
const { Errors }            = require('./enig_error.js');

//  deps
const async                 = require('async');
const _                     = require('lodash');

exports.moduleInfo = {
    name        : 'Who\'s Online',
    desc        : 'Who is currently online',
    author      : 'NuSkooler',
    packageName : 'codes.l33t.enigma.whosonline'
};

const MciViewIds = {
    OnlineList      : 1,
};

exports.getModule = class WhosOnlineModule extends MenuModule {
    constructor(options) {
        super(options);
    }

    mciReady(mciData, cb) {
        super.mciReady(mciData, err => {
            if(err) {
                return cb(err);
            }

            async.series(
                [
                    (next) => {
                        return this.prepViewController('online', 0, mciData.menu, next);
                    },
                    (next) => {
                        const onlineListView = this.viewControllers.online.getView(MciViewIds.OnlineList);
                        if(!onlineListView) {
                            return cb(Errors.MissingMci(`Missing online list MCI ${MciViewIds.OnlineList}`));
                        }

                        const onlineList = getActiveNodeList(true).slice(0, onlineListView.height).map(
                            oe => Object.assign(oe, { timeOn : _.upperFirst(oe.timeOn.humanize()) })
                        );

                        onlineListView.setItems(onlineList);
                        onlineListView.redraw();
                        return next(null);
                    }
                ],
                err => {
                    if(err) {
                        this.client.log.error( { error : err.message }, 'Error loading who\'s online');
                    }
                    return cb(err);
                }
            );
        });
    }
};
