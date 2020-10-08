let Service, Characteristic;

const axios = require('axios');

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory('homebridge-winix-c545', 'WinixC545', WinixC545);
}

function WinixC545(log, config) {
    this.log = log;
    this.name = config.name || 'Air Purifier';
    this.deviceId = config.deviceId;

    this.apiServer = `https://smart.us.gw.winixcorp.com/homedevice/control/${this.deviceId}`;
    this.deviceStatusServer = `https://smart.us.gw.winixcorp.com/homedevice/status/${this.deviceId}`;

    this.showAirQuality = config.showAirQuality || false;
    this.nameAirQuality = config.nameAirQuality || 'Air Quality';

    this.showPlasmawave = config.showPlasmawave || false;

    this.device = null;

    this.services = [];

    if (!this.deviceId) {
        throw new Error('Your must provide deviceId of the Air Purifier.');
    }

    this.service = new Service.AirPurifier(this.name);

    this.service
        .getCharacteristic(Characteristic.Active)
        .on('get', this.getActiveState.bind(this))
        .on('set', this.setActiveState.bind(this));

    this.service
        .getCharacteristic(Characteristic.CurrentAirPurifierState)
        .on('get', this.getCurrentAirPurifierState.bind(this));

    this.service
        .getCharacteristic(Characteristic.TargetAirPurifierState)
        .on('get', this.getTargetAirPurifierState.bind(this))
        .on('set', this.setTargetAirPurifierState.bind(this));

    this.service
        .getCharacteristic(Characteristic.RotationSpeed)
        .on('get', this.getRotationSpeed.bind(this))
        .on('set', this.setRotationSpeed.bind(this));

    if (this.showPlasmawave) {
        this.switchService = new Service.Switch(this.name + ' Plasmawave');

        this.switchService
            .getCharacteristic(Characteristic.On)
            .on('get', this.getPlasmawave.bind(this))
            .on('set', this.setPlasmawave.bind(this));

        this.services.push(this.switchService);
    }

    this.serviceInfo = new Service.AccessoryInformation();

    this.serviceInfo
        .setCharacteristic(Characteristic.Manufacturer, 'Winix')
        .setCharacteristic(Characteristic.Model, 'C545');

    this.services.push(this.service);
    this.services.push(this.serviceInfo);

    if (this.showAirQuality) {
        this.airQualitySensorService = new Service.AirQualitySensor(this.nameAirQuality);

        this.airQualitySensorService
            .getCharacteristic(Characteristic.AirQuality)
            .on('get', this.getAirQuality.bind(this));

        this.services.push(this.airQualitySensorService);
    }

    this.init();
}

WinixC545.prototype = {
    serverStatuses: {
        POWER: 'A02',
        AUTO_MANUAL: 'A03',
        ROTATION_SPEED: 'A04',
        PLASMAWAVE: 'A07',
        AIR_QUALITY: 'S07'
    },

    init () {
        this.getStatusesFromServer();
    },

    getStatusFromServer(status) {
        return this.getStatusesFromServer()
            .then(response => response[status])
            .then((response) => {
                return parseInt(response, 10) || 0;
            });
    },

    getStatusesFromServer() {
        return axios.get(this.deviceStatusServer)
            .then(response => response.data.body.data[0])
            .then(response => {
                this.device = response;
                return response.attributes;
            });
    },

    getActiveState: function (callback) {
        if (!this.device) {
            callback(new Error('No Air Purifier is discovered.'));
            return;
        }

        this.getStatusFromServer(this.serverStatuses.POWER)
            .then((status) => status ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE)
            .then((status) => {
                callback(null, status)
            });
    },

    setActiveState: function (state, callback) {
        if (!this.device) {
            callback(new Error('No Air Purifier is discovered.'));
            return;
        }

        const url = `${this.apiServer}/A02:${state}`;

        axios.get(url)
            .then(() => {
                this.service.getCharacteristic(Characteristic.Active).updateValue(state);
                callback(null);
            })
            .catch(err => callback(err));
    },

    getCurrentAirPurifierState: function (callback) {
        if (!this.device) {
            callback(new Error('No Air Purifier is discovered.'));
            return;
        }

        this.getStatusFromServer(this.serverStatuses.POWER)
            .then((status) => status ? Characteristic.CurrentAirPurifierState.PURIFYING_AIR : Characteristic.CurrentAirPurifierState.INACTIVE)
            .then((status) => callback(null, status));
    },

    getTargetAirPurifierState: function (callback) {
        if (!this.device) {
            callback(new Error('No Air Purifier is discovered.'));
            return;
        }

        this.getStatusFromServer(this.serverStatuses.AUTO_MANUAL)
            .then((status) => status === 1 ? Characteristic.TargetAirPurifierState.AUTO : Characteristic.TargetAirPurifierState.MANUAL)
            .then((status) => callback(null, status));
    },

    setTargetAirPurifierState: function (state, callback) {
        if (!this.device) {
            callback(new Error('No Air Purifier is discovered.'));
            return;
        }

        const targetState = state ? '01' : '02';

        const url = `${this.apiServer}/A03:${targetState}`

        axios.get(url)
            .then(() => {
                callback(null);
                this.service.getCharacteristic(Characteristic.TargetAirPurifierState).updateValue(state);
            })
            .catch(err => callback(err));
    },

    getRotationSpeed: function (callback) {
        if (!this.device) {
            callback(new Error('No Air Purifier is discovered.'));
            return;
        }

        this.getStatusFromServer(this.serverStatuses.ROTATION_SPEED)
            .then((status) => {
                let speed = 0;

                if (status === 1) {
                    speed = 25;
                }
                if (status === 2) {
                    speed = 50;
                }
                if (status === 3) {
                    speed = 75;
                }
                if (status === 5) {
                    speed = 100;
                }
                return speed;
            })
            .then((status) => {
                callback(null, status)
            });
    },

    setRotationSpeed: function (speed, callback) {
        if (!this.device) {
            callback(new Error('No Air Purifier is discovered.'));
            return;
        }

        let targetState = '01';

        if (speed > 75) {
            targetState = '05'
        }
        if (speed <= 75) {
            targetState = '03'
        }
        if (speed <= 50) {
            targetState = '02'
        }
        if (speed <= 25) {
            targetState = '01'
        }

        const url = `${this.apiServer}/A04:${targetState}`

        axios.get(url)
            .then(() => {
                callback(null);
            })
            .catch(err => callback(err));
    },

    getAirQuality: function (callback) {
        if (!this.device) {
            callback(new Error('No Air Purifier is discovered.'));
            return;
        }

        this.getStatusFromServer(this.serverStatuses.AIR_QUALITY)
            .then((status) => {
                let quality = Characteristic.AirQuality.UNKNOWN;

                if (status === 1) {
                    quality = Characteristic.AirQuality.GOOD
                }
                if (status === 2) {
                    quality = Characteristic.AirQuality.FAIR
                }
                if (status === 3) {
                    quality = Characteristic.AirQuality.POOR
                }

                return quality;
            })
            .then((quality) => {
                callback(null, quality)
            });
    },

    getPlasmawave: async function (callback) {
        if (!this.device) {
            callback(new Error('No Air Purifier is discovered.'));
            return;
        }

        this.getStatusFromServer(this.serverStatuses.PLASMAWAVE)
            .then((status) => {
                callback(null, status)
            });
    },

    setPlasmawave: function (state, callback) {
        if (!this.device) {
            callback(new Error('No Air Purifier is discovered.'));
            return;
        }

        const targetState = state ? 1 : 0;

        const url = `${this.apiServer}/A07:${targetState}`;

        axios.get(url)
            .then(() => {
                callback(null);
            })
            .catch(err => callback(err));
    },

    identify: function (callback) {
        callback();
    },

    getServices: function () {
        return this.services;
    }
};
