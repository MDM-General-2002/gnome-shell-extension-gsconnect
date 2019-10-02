'use strict';

const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;

const Contacts = imports.service.ui.contacts;
const Messaging = imports.service.ui.messaging;


var LegacyMessagingDialog = GObject.registerClass({
    GTypeName: 'GSConnectLegacyMessagingDialog',
    Properties: {
        'device': GObject.ParamSpec.object(
            'device',
            'Device',
            'The device associated with this window',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            GObject.Object
        ),
        'plugin': GObject.ParamSpec.object(
            'plugin',
            'Plugin',
            'The plugin providing messages',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            GObject.Object
        )
    },
    Template: 'resource:///org/gnome/Shell/Extensions/GSConnect/ui/telephony.ui',
    Children: [
        'infobar', 'stack',
        'message-box', 'entry'
    ]
}, class Dialog extends Gtk.Dialog {

    _init(params) {
        this.connectTemplate();
        super._init({
            application: Gio.Application.get_default(),
            device: params.device,
            plugin: params.plugin,
            use_header_bar: true
        });

        this.set_response_sensitive(Gtk.ResponseType.OK, false);

        // Dup some functions
        this.headerbar = this.get_titlebar();
        this._setHeaderBar = Messaging.Window.prototype._setHeaderBar;

        // Info bar
        this.device.bind_property(
            'connected',
            this.infobar,
            'reveal-child',
            GObject.BindingFlags.INVERT_BOOLEAN
        );

        // Message Entry/Send Button
        this.device.bind_property(
            'connected',
            this.entry,
            'sensitive',
            GObject.BindingFlags.DEFAULT
        );

        this._connectedId = this.device.connect(
            'notify::connected',
            this._onStateChanged.bind(this)
        );

        this._entryChangedId = this.entry.buffer.connect(
            'changed',
            this._onStateChanged.bind(this)
        );

        // Set the message if given
        if (params.message) {
            this.message = params.message;
            let message = new Messaging.MessageLabel(this.message);
            message.margin_bottom = 12;
            this.message_box.add(message);
        }

        // Set the address if given
        if (params.addresses) {
            this.addresses = params.addresses;

        // Otherwise load the contact list
        } else {
            this.contact_chooser = new Contacts.ContactChooser({
                device: this.device
            });
            this.stack.add_named(this.contact_chooser, 'contact-chooser');
            this.stack.child_set_property(this.contact_chooser, 'position', 0);

            this._numberSelectedId = this.contact_chooser.connect(
                'number-selected',
                this._onNumberSelected.bind(this)
            );

            this.stack.visible_child_name = 'contact-chooser';
        }

        this.restoreGeometry('legacy-messaging-dialog');
    }

    vfunc_delete_event() {
        if (this._numberSelectedId) {
            this.contact_chooser.disconnect(this._numberSelectedId);
            this.contact_chooser.destroy();
        }

        this.device.disconnect(this._connectedId);
        this.entry.buffer.disconnect(this._entryChangedId);

        return false;
    }

    vfunc_response(response_id) {
        if (response_id === Gtk.ResponseType.OK) {
            // Refuse to send empty or whitespace only texts
            if (!this.entry.buffer.text.trim()) return;

            this.plugin.sendMessage(
                this._addresses,
                this.entry.buffer.text,
                1,
                true
            );
        }

        this.disconnectTemplate();
        this.saveGeometry();
        this.destroy();
    }

    get addresses() {
        if (this._addresses === undefined) {
            this._addresses = [];
        }

        return this._addresses;
    }

    set addresses(addresses = []) {
        this._addresses = addresses;

        // Set the headerbar
        this._setHeaderBar(this._addresses);

        // Show the message editor
        this.stack.visible_child_name = 'message-editor';
        this._onStateChanged();
    }

    get plugin() {
        return this._plugin || null;
    }

    set plugin(plugin) {
        this._plugin = plugin;
    }

    _onNumberSelected(chooser, number) {
        let contacts = chooser.getSelected();

        this.addresses = Object.keys(contacts).map(address => {
            return {address: address};
        });
    }

    _onStateChanged() {
        switch (false) {
            case this.device.connected:
            case (this.entry.buffer.text.trim().length):
            case (this.stack.visible_child_name === 'message'):
                this.set_response_sensitive(Gtk.ResponseType.OK, false);
                break;

            default:
                this.set_response_sensitive(Gtk.ResponseType.OK, true);
        }
    }

    /**
     * Set the contents of the message entry
     *
     * @param {String} text - The message to place in the entry
     */
    setMessage(text) {
        this.entry.buffer.text = text;
    }
});

