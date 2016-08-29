'use strict';

var path = require('path');
var through = require('through2'),
  gutil = require('gulp-util'),
  _ = require('lodash'),
  fs = require('fs'),
  jsYaml = require('js-yaml'),
  templateFilePath = path.join(__dirname, '/template.ts'),
  PluginError = gutil.PluginError,
  VALID_TYPES = ['constant', 'value'],
  PLUGIN_NAME = 'gulp-ts-config',
  WRAP_TEMPLATE = '',
  ES6_TEMPLATE = '';

function gulpTsConfig(moduleName, configuration) {
  var templateFile, stream, defaults;
  defaults = {
    type: 'constant',
    createModule: true,
    wrap: false,
    environment: null,
    parser: null,
    pretty: false
  };

  if (!moduleName) {
    throw new PluginError(PLUGIN_NAME, 'Missing required moduleName option for gulp-ts-config');
  }

  templateFile = fs.readFileSync(templateFilePath, 'utf8');
  configuration = configuration || {};
  configuration = _.merge({}, defaults, configuration);

  stream = through.obj(function(file, encoding, callback) {
    var constants = [],
      templateOutput,
      jsonObj,
      wrapTemplate,
      spaces;

    if (!configuration.parser && (_.endsWith(file.path, 'yml') || _.endsWith(file.path, 'yaml'))) {
      configuration.parser = 'yml';
    }

    if (!configuration.parser) {
      configuration.parser = 'json';
    }

    if (configuration.parser === 'json') {
      try {
        jsonObj = file.isNull() ? {} : JSON.parse(file.contents.toString('utf8'));
      } catch (e) {
        this.emit('error', new PluginError(PLUGIN_NAME, 'invalid JSON file provided'));
        return callback();
      }
    } else if (configuration.parser === 'yml' || configuration.parser === 'yaml') {
      try {
        jsonObj = jsYaml.safeLoad(file.contents);
      } catch (e) {
        this.emit('error', new PluginError(PLUGIN_NAME, 'invaild YML file provided'));
        return callback();
      }
    } else {
      this.emit('error', new PluginError(PLUGIN_NAME, configuration.parser + ' is not supported as a valid parser'));
      return callback();
    }

    if (!_.isPlainObject(jsonObj)) {
      this.emit('error', new PluginError(PLUGIN_NAME, 'configuration file contains invalid JSON'));
      return callback();
    }

    // select the environment in the configuration
    if (configuration.environment) {
      if (_.get(jsonObj, configuration.environment, false)) {
        jsonObj = _.get(jsonObj, configuration.environment);
      } else {
        this.emit('error', new PluginError(PLUGIN_NAME, 'invalid \'environment\' value'));
        return callback();
      }
    }

    if (!_.contains(VALID_TYPES, configuration.type)) {
      this.emit('error', new PluginError(PLUGIN_NAME, 'invalid \'type\' value'));
      return callback();
    }

    jsonObj = _.merge({}, jsonObj, configuration.constants || {});

    if (_.isUndefined(configuration.pretty) || configuration.pretty === false) {
      spaces = 0;
    } else if (configuration.pretty === true) {
      spaces = 2;
    } else if (!isNaN(configuration.pretty) && Number.isFinite(configuration.pretty)) {
      spaces = parseInt(configuration.pretty, 10);
    } else {
      this.emit('error', new PluginError(
        PLUGIN_NAME,
        'invalid \'pretty\' value. Should be boolean value or an integer number'
      ));
      return callback();
    }

    _.each(jsonObj, function(value, key) {
      constants.push({
        name: key,
        value: JSON.stringify(value, null, spaces)
      });
    });

    templateOutput = _.template(templateFile)({
      createModule: configuration.createModule,
      moduleName: moduleName,
      type: configuration.type,
      constants: constants
    });

    if (configuration.wrap) {
      if (typeof configuration.wrap === 'string' &&
        (configuration.wrap.toUpperCase() === 'ES6' || configuration.wrap.toUpperCase() === 'ES2015')) {
        wrapTemplate = ES6_TEMPLATE;
      } else if (typeof configuration.wrap === 'string') {
        wrapTemplate = configuration.wrap;
      } else {
        wrapTemplate = WRAP_TEMPLATE;
      }
      templateOutput = _.template(wrapTemplate)({
        module: templateOutput
      });
    }

    file.path = gutil.replaceExtension(file.path, '.ts');
    file.contents = new Buffer(templateOutput);
    this.push(file);
    callback();
  });

  return stream;
}

module.exports = gulpTsConfig;
