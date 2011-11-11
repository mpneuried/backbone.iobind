
/**
 * Module dependencies.
 */

var express = require('express')
  , stylus = require('stylus')
  , socketio = require('socket.io')
  , routes = require('./routes')
  , folio = require('folio')
  , path = require('path')
  , redis = require('redis')
  , seed = require('seed');

var app = module.exports = express.createServer();

// Configuration
root._CONFIG_PORT = parseInt( process.argv[2] , 10 ) || 1227;

var stylus_compile = function (str, path) {
  return stylus(str)
          .set('filename', path)
          .set('compress', true)
          .include(require('nib').path)
          .include(require('fez').path);
};

root._CONFIG = { redis: {
  host: "192.168.11.24",
  port: 6379}}

var RedisStore = socketio.RedisStore;
var redisClient = redis.createClient( _CONFIG.redis.port, _CONFIG.redis.host, _CONFIG.redis.options || {} )

var ioRediStore = new RedisStore( { nodeId: function(){ return "instance_" + _CONFIG_PORT } } );


app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(stylus.middleware({
    src: path.join(__dirname, 'styles'),
    dest: path.join(__dirname, 'public'),
    compile: stylus_compile,
    force: true // this forces the css to be regenerated on every pageview
  }));
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

// Our psuedo database, on Seed.
// https://github.com/logicalparadox/seed

var Minimal = {};

Minimal.Todo = Seed.Model.extend('todo', {
  schema: new Seed.Schema({
    title: String,
    completed: Boolean
  })
});

Minimal.Todos = Seed.Graph.extend({
  initialize: function () {
    this.define(Minimal.Todo);
  }
});

var db = new Minimal.Todos()
  , guid = new Seed.ObjectId();

// Socket.io

var io = require('socket.io').listen(app);

io.configure(
  io.enable('browser client minification'),
  io.enable('browser client etag'),
  io.enable('browser client gzip'),
  io.set('log level', 10),
  io.set( "store", ioRediStore )
);

/**
 * our socket transport events
 * 
 * You will notice that when we emit the changes
 * in `create`, `update`, and `delete` we both
 * socket.emit and socket.broadcast.emit
 * 
 * socket.emit sends the changes to the browser session
 * that made the request. not required in some scenarios
 * where you are only using ioSync for Socket.io
 * 
 * socket.broadcast.emit sends the changes to 
 * all other browser sessions. this keeps all
 * of the pages in mirror. our client-side model
 * and collection ioBinds will pick up these events
 */

io.sockets.on('connection', function (socket) {
  
  /**
   * todo:create
   * 
   * called when we .save() our new todo
   * 
   * we listen on model namespace, but emit
   * on the collection namespace
   */
  
  socket.on('todo:create', function (data, callback) {
    var id = guid.gen()
      , todo = db.set('/todo/' + id, data)
      , json = todo._attributes;
    
    socket.emit('todos:create', json);
    socket.broadcast.emit('todos:create', json);
    callback(null, json);
  });
  
  /**
   * todos:read
   * 
   * called when we .fetch() our collection
   * in the client-side router
   */
  
  socket.on('todos:read', function (data, callback) {
    var list = [];
    
    db.each('todo', function (todo) {
      list.push(todo._attributes);
    });
    
    callback(null, list);
  });
  
  /**
   * todos:update
   * 
   * called when we .save() our model
   * after toggling its completed status
   */
  
  socket.on('todos:update', function (data, callback) {
    var todo = db.get('/todo/' + data.id);
    todo.set(data);
    
    var json = todo._attributes;
    
    socket.emit('todos/' + data.id + ':update', json);
    socket.broadcast.emit('todos/' + data.id + ':update', json);
    callback(null, json);
  });
  
  /**
   * todos:delete
   * 
   * called when we .destroy() our model
   */
  
  socket.on('todos:delete', function (data, callback) {
    var json = db.get('/todo/' + data.id)._attributes;
    
    db.del('/todo/' + data.id);
    
    socket.emit('todos/' + data.id + ':delete', json);
    socket.broadcast.emit('todos/' + data.id + ':delete', json);
    callback(null, json);
  });
  
});

// Routes

app.get('/', routes.index);
app.get('/js/templates.js', routes.templatejs);
app.get('/js/vendor.js', routes.vendorjs);

if (!module.parent) {
  app.listen(_CONFIG_PORT);
  console.log("Backbone.ioBind Example App listening on port %d in %s mode", app.address().port, app.settings.env);
  console.log( "\033[31m\nINFO: you can define the PORT by starting with the port as a argument. Example:\033[1m\napp.js 8010\n\033[0m" )
}