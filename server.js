import ws from 'uwebsockets'
import {DataTypes, Model, Op, Sequelize} from 'sequelize'
import sqlite from 'sqlite3'

let counter = 0
let lastFlush = performance.now()

const sequelize = new Sequelize({
  host: 'localhost',
  dialect: 'sqlite',
  storage: 'db/database.sqlite',
  operatorsAliases: false,
  mode: sqlite.OPEN_READWRITE,
  // logging: false,
})

try {
  await sequelize.authenticate();
  console.log('Connection has been established successfully.');
} catch (error) {
  console.error('Unable to connect to the database:', error);
}

class Count extends Model {
}

Count.init({count: DataTypes.INTEGER}, {sequelize});
await sequelize.sync({alter: true})

let [dbEntry] = await Count.findOrCreate({where: {count: {[Op.gte]: 0}}, defaults: {count: 0}})

ws
  .App()
  .ws("/*", {
    idleTimeout: 32,
    maxBackpressure: 1024,
    maxPayloadLength: 512,
    compression: 0,
    open: (ws) => {
      ws.send(dbEntry.count.toString())
      ws.subscribe('counter');
    },
    message: (ws, message, isBinary) => {
      if (message.byteLength !== 1 || new DataView(message).getUint8(0) !== 49) return
      counter++
      if (performance.now() - lastFlush > 1000 * 2) {
        dbEntry.count += counter
        counter = 0
        lastFlush = performance.now()
        dbEntry.save().then((newDbEntry) => {
          dbEntry = newDbEntry
          ws.publish('counter', dbEntry.count.toString())
        })
      }
    },
  })
  .listen(9001, (listenSocket) => {
    if (listenSocket) console.log("Listening to port 9001");
  });
