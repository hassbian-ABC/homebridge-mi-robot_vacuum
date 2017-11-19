require('./Base');

const inherits = require('util').inherits;
const miio = require('miio');

var Accessory, PlatformAccessory, Service, Characteristic, UUIDGen;

MiRobotVacuum2 = function(platform, config) {
    this.init(platform, config);
    
    Accessory = platform.Accessory;
    PlatformAccessory = platform.PlatformAccessory;
    Service = platform.Service;
    Characteristic = platform.Characteristic;
    UUIDGen = platform.UUIDGen;
    
    this.device = new miio.Device({
        address: this.config['ip'],
        token: this.config['token']
    });
    
    this.accessories = {};
    if(!this.config['robotVacuumDisable'] && this.config['robotVacuumName'] && this.config['robotVacuumName'] != "") {
        this.accessories['fanAccessory'] = new MiRobotVacuum2FanAccessory(this);
    }
    var accessoriesArr = this.obj2array(this.accessories);
    
    this.platform.log.debug("[MiRobotVacuumPlatform][DEBUG]Initializing " + this.config["type"] + " device: " + this.config["ip"] + ", accessories size: " + accessoriesArr.length);
    
    return accessoriesArr;
}
inherits(MiRobotVacuum2, Base);

MiRobotVacuum2FanAccessory = function(dThis) {
    this.device = dThis.device;
    this.name = dThis.config['robotVacuumName'];
    this.enablePauseToCharge = (null != dThis.config['enablePauseToCharge']) ? dThis.config['enablePauseToCharge'] : true;
    this.platform = dThis.platform;
}

MiRobotVacuum2FanAccessory.prototype.getServices = function() {
    var that = this;
    var services = [];

    var infoService = new Service.AccessoryInformation();
    infoService
        .setCharacteristic(Characteristic.Manufacturer, "XiaoMi")
        .setCharacteristic(Characteristic.Model, "Robot Vacuum 2")
        .setCharacteristic(Characteristic.SerialNumber, "Undefined");
    services.push(infoService);

    var fanService = new Service.Fan(this.name);
    var nameCharacteristic = fanService.getCharacteristic(Characteristic.Name);
    var onCharacteristic = fanService.getCharacteristic(Characteristic.On);
    var rotationSpeedCharacteristic = fanService.addCharacteristic(Characteristic.RotationSpeed);
//    var rotationDirectionCharacteristic = fanService.addCharacteristic(Characteristic.RotationDirection);
    
    onCharacteristic
        .on('get', function(callback) {
            that.device.call("get_status", [], {retries: 3}).then(result => {
                that.platform.log.debug("[MiRobotVacuumPlatform][DEBUG]MiRobotVacuum2FanAccessory - On - getOn: " + JSON.stringify(result[0]));
                callback(null, result[0]['state'] === 5 ? true : false);
            }).catch(function(err) {
                that.platform.log.error("[MiRobotVacuumPlatform][ERROR]MiRobotVacuum2FanAccessory - On - getOn Error: " + err);
                callback(err);
            });
        }.bind(this))
        .on('set', function(value, callback) {
            that.platform.log.debug("[MiRobotVacuumPlatform][DEBUG]MiRobotVacuum2FanAccessory - On - setOn: " + value);
            that.device.call(value ? "app_start" : "app_pause", []).then(result => {
                that.platform.log.debug("[MiRobotVacuumPlatform][DEBUG]MiRobotVacuum2FanAccessory - On - setOn Result: " + result);
                if(result === "ok") {
                    if(!value && that.enablePauseToCharge){
                        that.device.call("app_charge", []).then(result => {
                            that.platform.log.debug("[MiRobotVacuumPlatform][DEBUG]MiRobotVacuum2FanAccessory - On - setOn Result: " + result);
                            if(result[0] === "ok") {
                                callback(null);
                            } else {
                                callback(new Error(result));
                            }
                        }).catch(function(err) {
                            that.platform.log.error("[MiRobotVacuumPlatform][ERROR]MiRobotVacuum2FanAccessory - On - setOn Error: " + err);
                            callback(err);
                        });
                    } else {
                        callback(null);
                    }
                } else {
                    callback("result: " + result);
                }
            }).catch(function(err) {
                that.platform.log.error("[MiRobotVacuumPlatform][ERROR]MiRobotVacuum2FanAccessory - On - setOn Error: " + err);
                callback(err);
            });
        }.bind(this));
    rotationSpeedCharacteristic
        .on('get', function(callback) {
            that.device.call("get_status", []).then(result => {
                that.platform.log.debug("[MiRobotVacuumPlatform][DEBUG]MiRobotVacuum2FanAccessory - RotationSpeed - getRotationSpeed: " + JSON.stringify(result[0]));
                var fan_power = result[0]['fan_power'];
                callback(fan_power);
            }).catch(function(err) {
                that.platform.log.error("[MiRobotVacuumPlatform][ERROR]MiRobotVacuum2FanAccessory - RotationSpeed - getRotationSpeed Error: " + err);
                callback(err);
            });
        }.bind(this))
        .on('set', function(value, callback) {
            if(value <= 0) {
                callback(null);
            } else {
                var nowLevel = that.getLevelBySpeed(rotationSpeedCharacteristic.value);
                var valueLevel = that.getLevelBySpeed(value);
                that.platform.log.debug("[MiRobotVacuumPlatform][DEBUG]MiRobotVacuum2FanAccessory - RotationSpeed - setRotationSpeed: " + value + ", valueLevel: " + valueLevel + ", nowValue: " + rotationSpeedCharacteristic.value + ", nowLevel: " + nowLevel);
                if(nowLevel == valueLevel) {
                    callback(null);
                } else {
                    that.device.call("set_custom_mode", [valueLevel]).then(result => {
                        that.platform.log.debug("[MiRobotVacuumPlatform][DEBUG]MiRobotVacuum2FanAccessory - RotationSpeed - setRotationSpeed Result: " + result);
                        if(result == "ok") {
                            callback(null);
                        } else {
                            callback(new Error(result));
                        }
                    }).catch(function(err) {
                        that.platform.log.error("[MiRobotVacuumPlatform][ERROR]MiRobotVacuum2FanAccessory - RotationSpeed - setRotationSpeed Error: " + err);
                        callback(err);
                    });
                }
            }
        }.bind(this));
    services.push(fanService);

    var batteryService = new Service.BatteryService();
    var batLowCharacteristic = batteryService.getCharacteristic(Characteristic.StatusLowBattery);
    var batLevelCharacteristic = batteryService.getCharacteristic(Characteristic.BatteryLevel);
    batLevelCharacteristic
        .on('get', function(callback) {
            that.device.call("get_status", []).then(result => {
                that.platform.log.debug("[MiRobotVacuumPlatform][DEBUG]MiRobotVacuum2FanAccessory - Battery - getLevel: " + JSON.stringify(result[0]));
                var battery = result[0]['battery'];
                batLowCharacteristic.updateValue(battery < 20 ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
                callback(null, battery);
            }).catch(function(err) {
                that.platform.log.error("[MiRobotVacuumPlatform][ERROR]MiRobotVacuum2FanAccessory - Battery - getLevel Error: " + err);
                callback(err);
            });
        }.bind(this));
    var batChargingStateCharacteristic = batteryService.getCharacteristic(Characteristic.ChargingState);
    batChargingStateCharacteristic
        .on('get', function(callback) {
            that.device.call("get_status", []).then(result => {
                that.platform.log.debug("[MiRobotVacuumPlatform][DEBUG]MiRobotVacuum2FanAccessory - Battery - getChargingState: " + JSON.stringify(result[0]));
                callback(null, result[0]['state'] === 8 ? Characteristic.ChargingState.CHARGING : Characteristic.ChargingState.NOT_CHARGING);
            }).catch(function(err) {
                that.platform.log.error("[MiRobotVacuumPlatform][ERROR]MiRobotVacuum2FanAccessory - Battery - getChargingState Error: " + err);
                callback(err);
            });
        }.bind(this));
    services.push(batteryService);

    return services;
}

MiRobotVacuum2FanAccessory.prototype.getLevelBySpeed = function(speed) {
    return speed;
}
