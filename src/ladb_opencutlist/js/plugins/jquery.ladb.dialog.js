+function ($) {
    'use strict';

    // CONSTANTS
    // ======================

    var SETTING_KEY_COMPATIBILITY_ALERT_HIDDEN = 'compatibility_alert_hidden';

    // CLASS DEFINITION
    // ======================

    var LadbDialog = function (element, options) {
        this.options = options;
        this.$element = $(element);

        this.capabilities = {
            version: options.version,
            build: options.build,
            sketchupIsPro: options.sketchup_is_pro,
            sketchupVersion: options.sketchup_version,
            sketchupVersionNumber: options.sketchup_version_number,
            rubyVersion: options.ruby_version,
            currentOS: options.current_os,
            is64bit: options.is_64bit,
            userAgent: window.navigator.userAgent,
            locale: options.locale,
            language: options.language,
            available_languages: options.available_languages,
            htmlDialogCompatible: options.html_dialog_compatible,
            dialogMaximizedWidth: options.dialog_maximized_width,
            dialogMaximizedHeight: options.dialog_maximized_height,
            dialogLeft: options.dialog_left,
            dialogTop: options.dialog_top
        };

        this.settings = {};

        this.maximized = false;

        this.activeTabName = null;
        this.tabs = {};
        this.tabBtns = {};

        this.$wrapper = null;
        this.$btnMinimize = null;
        this.$btnMaximize = null;
        this.$btnMore = null;
        this.$btnCloseCompatibilityAlert = null;
    };

    LadbDialog.DEFAULTS = {
        defaultTabName: 'cutlist',
        tabDefs: [
            {
                name: 'materials',
                bar: 'leftbar',
                icon: 'ladb-opencutlist-icon-materials'
            },
            {
                name: 'cutlist',
                bar: 'leftbar',
                icon: 'ladb-opencutlist-icon-cutlist'
            },
            {
                name: 'importer',
                bar: 'leftbar',
                icon: 'ladb-opencutlist-icon-import'
            },
            {
                name: 'settings',
                bar: 'bottombar',
                icon: 'ladb-opencutlist-icon-settings'
            },
            {
                name: 'about',
                bar: 'bottombar',
                icon: null
            }
        ]
    };

    // Settings /////

    LadbDialog.prototype.pullSettings = function (keys, strategy, callback) {
        var that = this;

        // Read settings values from SU default or Model attributes according to the strategy
        rubyCallCommand('core_read_settings', { keys: keys, strategy: strategy ? strategy : 0 /* SETTINGS_RW_STRATEGY_GLOBAL */ }, function (data) {
            var values = data.values;
            for (var i = 0; i < values.length; i++) {
                var value = values[i];
                that.settings[value.key] = value.value;
            }
            if (callback && typeof callback == 'function') {
                callback();
            }
        });
    };

    LadbDialog.prototype.setSettings = function (settings, strategy) {
        for (var i = 0; i < settings.length; i++) {
            var setting = settings[i];
            this.settings[setting.key] = setting.value;
        }
        // Write settings values to SU default or Model attributes according to the strategy
        rubyCallCommand('core_write_settings', { settings: settings, strategy: strategy ? strategy : 0 /* SETTINGS_RW_STRATEGY_GLOBAL */ });
    };

    LadbDialog.prototype.setSetting = function (key, value, strategy) {
        this.setSettings([ { key: key, value: value } ], strategy);
    };

    LadbDialog.prototype.getSetting = function (key, defaultValue) {
        var value = this.settings[key];
        if (value != null) {
            if (defaultValue !== undefined) {
                if (typeof(defaultValue) === 'number' && isNaN(value)) {
                    return defaultValue;
                }
            }
            return value;
        }
        return defaultValue;
    };

    // Actions /////

    LadbDialog.prototype.minimize = function () {
        var that = this;
        if (that.maximized) {
            rubyCallCommand('core_dialog_minimize', null, function () {
                Noty.closeAll();
                that.$wrapper.hide();
                that.$btnMinimize.hide();
                that.$btnMaximize.show();
                that.$btnMore.hide();
                that.maximized = false;
                that.$element.trigger(jQuery.Event('minimized.ladb.dialog'));
            });
        }
    };

    LadbDialog.prototype.maximize = function () {
        var that = this;
        if (!that.maximized) {
            rubyCallCommand('core_dialog_maximize', null, function () {
                that.$wrapper.show();
                that.$btnMinimize.show();
                that.$btnMaximize.hide();
                that.$btnMore.show();
                that.maximized = true;
                that.$element.trigger(jQuery.Event('maximized.ladb.dialog'));
            });
        }
    };

    LadbDialog.prototype.unselectActiveTab = function () {
        if (this.activeTabName) {

            // Flag as inactive
            this.tabBtns[this.activeTabName].removeClass('ladb-active');

            // Hide active tab
            this.tabs[this.activeTabName].hide();

        }
    };

    LadbDialog.prototype.selectTab = function (tabName, callback) {

        var $tab = this.tabs[tabName];
        var $freshTab = false;
        if (tabName !== this.activeTabName) {
            if (this.activeTabName) {
                this.unselectActiveTab();
            }
            if ($tab) {

                $freshTab = false;

                // Display tab
                $tab.show();

            } else {

                $freshTab = true;

                // Render and append tab
                this.$wrapper.append(Twig.twig({ ref: "tabs/" + tabName + "/tab.twig" }).render({
                    tabName: tabName,
                    capabilities: this.capabilities
                }));

                // Fetch tab
                $tab = $('#ladb_tab_' + tabName, this.$wrapper);

                // Initialize tab (with its jQuery plugin)
                var jQueryPluginFn = 'ladbTab' + tabName.charAt(0).toUpperCase() + tabName.slice(1);
                $tab[jQueryPluginFn]({
                    opencutlist: this,
                    initializedCallback: callback
                });

                // Setup tooltips & popovers
                this.setupTooltips();
                this.setupPopovers();

                // Cache tab
                this.tabs[tabName] = $tab;

            }

            // Flag tab as active
            this.tabBtns[tabName].addClass('ladb-active');
            this.activeTabName = tabName;

        }

        // By default maximize the dialog
        this.maximize();

        // If fresh tab, callback is invoke through 'initializedCallback'
        if (!$freshTab) {

            // Callback
            if (callback && typeof(callback) == 'function') {
                callback($tab);
            }

        }

        // Close all Noty
        Noty.closeAll();

        // Trigger event
        if ($tab) {
            $tab.trigger(jQuery.Event('shown.ladb.tab'));
        }

        return $tab;
    };

    LadbDialog.prototype.executeCommandOnTab = function (tabName, command, parameters, callback) {

        // Select tab and execute command
        this.selectTab(tabName, function ($tab) {
            var jQueryPlugin = $tab.data('ladb.tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
            if (jQueryPlugin) {
                jQueryPlugin.executeCommand(command, parameters, callback);
            }
        });

    };

    // Internals /////

    LadbDialog.prototype.notify = function (text, type, buttons, timeout) {
        if (undefined === type) {
            type = 'alert';
        }
        if (undefined === buttons) {
            buttons = [];
        }
        if (undefined === timeout) {
            timeout = 3000;
        }
        var n = new Noty({
            type: type,
            layout: 'bottomRight',
            theme: 'bootstrap-v3',
            text: text,
            timeout: timeout,
            buttons: buttons
        }).show();

        return n;
    };

    LadbDialog.prototype.notifyErrors = function (errors) {
        if (Array.isArray(errors)) {
            for (var i = 0; i < errors.length; i++) {
                var error = errors[i];
                var key = error;
                var options = {};
                if (Array.isArray(error) && error.length > 0) {
                    key = error[0];
                    if (error.length > 1) {
                        options = error[1];
                    }
                }
                this.notify('<i class="ladb-opencutlist-icon-warning"></i> ' + i18next.t(key, options), 'error');
            }
        }
    };

    LadbDialog.prototype.setupTooltips = function () {
        $('.tooltip').tooltip('hide'); // Assume that previouly created tooltips are closed
        $('[data-toggle="tooltip"]').tooltip({
            container: 'body'
        });
    };

    LadbDialog.prototype.setupPopovers = function () {
        $('[data-toggle="popover"]').popover({
            html: true
        });
    };

    LadbDialog.prototype.bind = function () {
        var that = this;

        // Bind buttons
        this.$btnMinimize.on('click', function () {
            that.minimize();
        });
        this.$btnMaximize.on('click', function () {
            that.maximize();
            if (!that.activeTabName) {
                that.selectTab(that.options.defaultTabName);
            }
        });
        $.each(this.tabBtns, function (tabName, $tabBtn) {
            $tabBtn.on('click', function () {
                that.maximize();
                that.selectTab(tabName);
            });
        });
        this.$btnCloseCompatibilityAlert.on('click', function () {
            $('#ladb_compatibility_alert').hide();
            that.compatibilityAlertHidden = true;
            that.setSetting(SETTING_KEY_COMPATIBILITY_ALERT_HIDDEN, that.compatibilityAlertHidden);
        });

    };

    LadbDialog.prototype.init = function () {
        var that = this;

        this.pullSettings([
                SETTING_KEY_COMPATIBILITY_ALERT_HIDDEN
            ],
            0 /* SETTINGS_RW_STRATEGY_GLOBAL */,
            function () {

                that.compatibilityAlertHidden = that.getSetting(SETTING_KEY_COMPATIBILITY_ALERT_HIDDEN, false);

                // Add i18next twig filter
                Twig.extendFilter("i18next", function (value, options) {
                    return i18next.t(value, options ? options[0] : {});
                });

                // Render and append layout template
                that.$element.append(Twig.twig({ref: "core/layout.twig"}).render({
                    capabilities: that.capabilities,
                    compatibilityAlertHidden: that.compatibilityAlertHidden,
                    tabDefs: that.options.tabDefs
                }));

                // Fetch usefull elements
                that.$wrapper = $('#ladb_wrapper', that.$element);
                that.$btnMinimize = $('#ladb_btn_minimize', that.$element);
                that.$btnMaximize = $('#ladb_btn_maximize', that.$element);
                that.$btnMore = $('#ladb_btn_more', that.$element);
                that.$btnCloseCompatibilityAlert = $('#ladb_btn_close_compatibility_alert', that.$element);
                for (var i = 0; i < that.options.tabDefs.length; i++) {
                    var tabDef = that.options.tabDefs[i];
                    that.tabBtns[tabDef.name] = $('#ladb_tab_btn_' + tabDef.name, that.$element);
                }

                that.bind();

                if (that.options.dialog_startup_tab_name) {
                    that.selectTab(that.options.dialog_startup_tab_name);
                }

            });

    };


    // PLUGIN DEFINITION
    // =======================

    function Plugin(option, params) {
        return this.each(function () {
            var $this = $(this);
            var data = $this.data('ladb.dialog');
            var options = $.extend({}, LadbDialog.DEFAULTS, $this.data(), typeof option == 'object' && option);

            if (!data) {
                $this.data('ladb.dialog', (data = new LadbDialog(this, options)));
            }
            if (typeof option == 'string') {
                data[option].apply(data, Array.isArray(params) ? params : [ params ])
            } else {
                data.init();
            }
        })
    }

    var old = $.fn.ladbDialog;

    $.fn.ladbDialog = Plugin;
    $.fn.ladbDialog.Constructor = LadbDialog;


    // NO CONFLICT
    // =================

    $.fn.ladbDialog.noConflict = function () {
        $.fn.ladbDialog = old;
        return this;
    }

}(jQuery);