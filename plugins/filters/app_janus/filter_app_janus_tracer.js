/* Janus Event Tracer (C) 2022 QXIP BV */

var base_filter = require('@pastash/pastash').base_filter,
  util = require('util'),
  logger = require('@pastash/pastash').logger;

var recordCache = require("record-cache");
var fetch = require('cross-fetch');

function nano_now(date){ return (date * 1000) + '000' }
function just_now(){ return new Date().getTime() }
function uuid(){ return (new Date()).getTime().toString(36) + Math.random().toString(36).slice(2) );

function FilterAppJanusTracer() {
  base_filter.BaseFilter.call(this);
  this.mergeConfig({
    name: 'AppJanusTracer',
    optional_params: ['debug', 'cacheSize', 'cacheAge', 'endpoint', 'bypass'],
    default_values: {
      'cacheSize': 50000,
      'cacheAge':  60000,
      'endpoint': 'http://localhost:3100/tempo/api/push',
      'bypass': true,
      'debug': false
    },
    start_hook: this.start.bind(this)
  });
}

util.inherits(FilterAppJanusTracer, base_filter.BaseFilter);

FilterAppJanusTracer.prototype.start = async function(callback) {

  // Event cache
  var cache = recordCache({
    maxSize: this.cacheSize,
    maxAge: this.cacheAge,
    onStale: false
  });
  this.cache = cache;

  // Session cache
  var sessions = recordCache({
    maxSize: this.cacheSize,
    maxAge: this.cacheAge,
    onStale: false
  });
  this.sessions = sessions;

  logger.info('Initialized App Janus Event Tracer');
  callback();
};

FilterAppJanusTracer.prototype.process = function(data) {
   if (!data.message) return data;
   var line = JSON.parse(data.message);
   if (!line.session_id || !line.handle_id) return data
	
   if (line.type == 1){
	var event = { name: line.event.name, event: line.event.name, id: line.session_id }
	event.traceId = uuid()
	event.duration = 0
	if (line.event.name == "created"){
		// start root trace, do not update
		this.sessions.add(event.session_id, just_now());
		this.session.add('uuid_'+event.session_id, event.traceId)
	} else if (line.event.name == "destroyed"){
		// end root trace
		this.sessions.remove(event.session_id);
		this.sessions.remove('uuid_'+event.session_id);
	}

   } else if (line.type == 2) {
	if (!line.event.data) return;
	var event = { name: line.event.name, event: line.event.name, id: line.session_id, handle: line.handle_id }
	// session tracing + reset
	event.traceId = this.sessions.get('uuid_'+event.session_id, 1)[0] || uuid();
	var previous_ts = this.sessions.get(event.session_id, 1)[0] || 0;
	event.duration = just_now() - parseInt(previous_ts);
	this.sessions.add(event.session_id, just_now());

	if(event.name == "attached") {
		// session_id, handle_id, opaque_id
	} else if (event.name == "detached") {
		// session_id, handle_id, opaque_id
		this.sessions.remove(event.handle_id);
	}
	event.parentId = event.id

   } else if (line.type == 64){
	if (!line.event.data) return data;
	var event = { name: line.event.plugin, event: line.event.data.event, id: line.event.data.id, handle: line.handle_id }
	// session tracing + reset
	event.traceId = this.sessions.get('uuid_'+event.session_id, 1)[0] || uuid();
	var previous_ts = this.sessions.get(event.session_id, 1)[0] || 0;
	event.duration = just_now() - parseInt(previous_ts);
	this.sessions.add(event.session_id, just_now());

	if (event.event == "joined"){
		// session_id, handle_id, opaque_id, event.data.id
		// correlate: session_id --> event.data.id
		this.cache.add(event.id, event.session_id);
	} else if (event.event == "configured"){
		// session_id, handle_id, opaque_id, event.data.id
	} else if (event.event == "published"){
		// session_id, handle_id, opaque_id, event.data.id
		this.cache.add(event.id, event.session_id);
	} else if (event.event == "unpublished"){
		// correlate: event.data.id --> session_id
		event.session_id = this.cache.get(fingerprint_event, 1)[0] || false;
		line.session_id = event.session_id;
	} else if (event.event == "leaving"){
		// correlate: event.data.id --> session_id
		event.session_id = this.cache.get(fingerprint_event, 1)[0] || false;
		line.session_id = event.session_id;
		this.cache.delete(event.id)
	}
        event.parentId = event.session_id
   }
	
   if(event){
	event.timestamp = line.timestamp;
	event.body = line;
   }
   if(event) var trace = tracegen(event, this.endpoint)
   if (!this.bypass) this.emit('output', trace)
   else if (this.bypass) this.emit('output', data);

};

exports.create = function() {
  return new FilterAppJanusTracer();
};

async function tracegen(event, endpoint){
  try {
    var trace = [{
	 "id": event.id,
	 "traceId": event.traceId,
	 "timestamp": nano_now(event.timestamp),
	 "duration": event.duration,
	 "name": event.name,
	  "localEndpoint": {
	    "serviceName": event.event
	  }
    }]
    if (event.parentId){ trace[0].parentId = event.parentId }
    if (event.tags){ trace[0].tags = event.tags }
    logger.info("trace: ", trace);
    // send event to endpoint
    if(endpoint){
	const response = fetch(endpoint, {
	  method: 'POST',
	  body: JSON.stringify(trace),
	  headers: {'Content-Type': 'application/json'}
	})
  .then(res => {
    logger.info(res.json())
  })
  .catch(err => {
    logger.error(err)
  });

  } catch(e) { console.log(e); return; }
}
