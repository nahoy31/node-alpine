/**
 *
 * Alpine, the Apache Log Parser
 *
 * Created by blarsen on 02.10.14.
 */

var Buffer = require('./buffer');

var byline = require('byline');
var _ = require("underscore.string");
var through2 = require('through2');

var Alpine = function (logformat) {

    this.setLogFormat = setLogFormat;
    this.getLogFormat = getLogFormat;
    this.setStopOnError = setStopOnError;
    this.getStopOnError = getStopOnError;
    this.parseLine = parseLine;
    this.getObjectStream = getObjectStream;
    this.getStringStream = getStringStream;
    this.parseReadStream = parseReadStream;

    if (logformat) {
        this.setLogFormat(logformat);
    } else {
        this.setLogFormat(Alpine.LOGFORMATS.COMBINED);
    }
};

function getObjectStream() {
    var thisAlpine = this;
    return through2.obj(function(chunk, enc, callback) {
        var data = thisAlpine.parseLine(chunk);
        this.push(data);
        callback();
    });
}

function getStringStream() {
    var thisAlpine = this;
    return through2.obj(function(chunk, enc, callback) {
        var data = thisAlpine.parseLine(chunk);
        this.push(JSON.stringify(data));
        callback();
    });
}

function parseReadStream(stream, callback) {
    var thisAlpine = this;
    var stream = byline.createStream(stream);
    stream.pipe(through2.obj(function(chunk, enc, t2callback) {
        var data = thisAlpine.parseLine(chunk.toString());
        callback(data);
        t2callback();
    }))
}

function getLogFormat() {
    return this.logformat;
}

function setLogFormat(logformat) {
    this.logformat = logformat;
    this.formatfields = parseLogFormat(logformat);
}

function getStopOnError() {
    return this.stopOnError;
}

function setStopOnError(stopOnError) {
    this.stopOnError = stopOnError;
}

function parseLine(line) {
    var result = {
        originalLine: line
    };

    var buf         = new Buffer(line, 0);
    var stopOnError = this.stopOnError;

    this.formatfields.forEach(function(field) {
        buf.skipSpaces();
        var val;
        if (field.isQuoted) {
            if (!(buf.lookingAt() === '"')) {
                if (stopOnError) {
                    throw new Error("Field defined as quoted was not quoted");
                }
            }

            buf.skip();
            val = buf.getUpto('"');
            buf.skip();
        } else if (field.isDate) {
            if (!(buf.lookingAt() === '[')) {
                if (stopOnError) {
                    throw new Error("Time field is not enclosed in brackets");
                }
            }

            buf.skip();
            val = buf.getUpto(']');
            buf.skip();
        } else if (field.hasColon) {
            val = buf.getUpto(':');
            buf.skip();
        } else {
            val = buf.getUpto(' ');
        }
        result[field.name] = val;
    })

    return result;
}

function parseLogFormat(logformat) {
    var fields = [];
    var buf = new Buffer(logformat, 0);
    while (buf.hasMore()) {
        buf.skipSpaces();
        var field = buf.getUpto(" ");
        //var isQuoted = field[0] === '"';
        //var field = stripQuotes(field);

        var test = hasColon(field);
        if (false !== test) {
            var i = 0;

            for (var field of test) {
                var fieldObject = addField(field)

                if (0 === i) {
                    fieldObject.hasColon = true;
                } else {
                    fieldObject.hasColon = false;
                }

                fields.push(fieldObject);

                i++;
            }

            continue;
        }

        var fieldObject = addField(field)
        fieldObject.hasColon = false;
        fields.push(fieldObject);
    }
    return fields;
}

function stripQuotes(text) {
    if ((_.startsWith(text, '"') && _.endsWith(text, '"'))
        || (_.startsWith(text, '[')) && _.endsWith(text, ']'))
        return text.substr(1, text.length-2);
    return text;
}

function hasColon(str) {
    var index = str.indexOf(':');

    if (index > -1) {
        return str.split(':');
    }

    return false;
}

function addField(field) {
    var isQuoted = field[0] === '"';
    field = stripQuotes(field);

    // Check that this is a field definition (starting with %) and remove the prefix
    if (!(field[0] === "%")) {
        throw new Error("Field does not start with %: "+field);
    }
    field = field.substring(1);

    // Remove modifiers
    if (field.indexOf("{") > 0) {
        field = field.replace(/^[0-9!]+//g, "");
    }
    field = field.replace(/[<>]/g, "");

    var fieldName = FIELDS[field];

    // Handle parameterized fields
    if (field.indexOf('{') >= 0) {
        var matches = (/{(.*)}(.*)/).exec(field);
        var value = matches[1];
        var field = matches[2];
        if (!PARAMFIELDS[field]) {
            throw new Error("The field "+field+" should not be parameterized");
        }
        fieldName = PARAMFIELDS[field] + ' ' + value;
    }

    if (!FIELDS[field]) {
        throw new Error("Unknown log format field " + field);
    }

    return {
        field:    field,
        name:     fieldName,
        isQuoted: isQuoted,
        isDate:   field === 't'
    };
}

Alpine.LOGFORMATS = {
    COMBINED: "%h %l %u %t \"%r\" %>s %b \"%{Referer}i\" \"%{User-agent}i\"",
    CLF: "%h %l %u %t \"%r\" %>s %b",
    CLF_VHOST: "%v %h %l %u %t \"%r\" %>s %b"
}

var FIELDS = {
    'a': 'remoteIP',
    'A': 'localIP',
    'B': 'size',
    'b': 'sizeCLF',
    'D': 'serveTime',
    'f': 'filename',
    'h': 'remoteHost',
    'H': 'requestProtocol',
    'k': 'keepaliveRequests',
    'l': 'logname',
    'm': 'requestMethod',
    'p': 'port',
    'P': 'pid',
    'q': 'queryString',
    'r': 'request',
    'R': 'responseHandler',
    's': 'status',
    't': 'time',
    'T': 'serveTime',
    'u': 'remoteUser',
    'U': 'urlPath',
    'v': 'canonicalServerName',
    'V': 'serverName',
    'X': 'connectionStatus',
    'I': 'bytesReceived',
    'O': 'bytesSent',
    'C': 'cookie',
    'e': 'environment',
    'i': 'requestHeader',
    'n': 'note',
    'o': 'responseHeader',
    'p': 'formatPort',
    'P': 'pidFormat',
    '^ti': 'requestTrailerLine',
    '^to': 'responseTrailerLine'
}

PARAMFIELDS = {
    "c": "Cookie",
    "e": "Environment",
    "i": "RequestHeader",
    "n": "Note",
    "o": "ResponseHeader",
    "p": "Port",
    "P": "PID",
    "t": "Time",
    '^ti': 'RequestTrailerLine',
    '^to': 'ResponseTrailerLine'
}

module.exports = Alpine;
