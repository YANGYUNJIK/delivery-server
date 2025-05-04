// // server/db.js
// const { MongoClient } = require('mongodb');

// // 🔁 MongoDB Atlas에서 받은 URI로 교체하세요
// const uri = 'mongodb+srv://admin:Bongyang0625!@cluster0.opqolsm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// const client = new MongoClient(uri);
// let db;

// async function connectToDatabase() {
//   try {
//     await client.connect();
//     db = client.db('delivery-db'); // 원하는 DB 이름으로 수정
//     console.log('✅ MongoDB 연결 성공');
//   } catch (error) {
//     console.error('❌ MongoDB 연결 실패:', error);
//   }
// }

// function getDb() {
//   return db;
// }

// module.exports = { connectToDatabase, getDb };


// db.js
const { MongoClient } = require('mongodb');
let db = null;

async function connectToDatabase() {
  const uri = process.env.MONGO_URI;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    db = client.db('delivery'); // 사용할 DB 이름
    console.log('✅ MongoDB 연결 성공');
  } catch (err) {
    console.error('❌ MongoDB 연결 실패:', err);
    throw err;
  }
}

function getDb() {
  if (!db) throw new Error('❌ DB 연결 안됨');
  return db;
}

module.exports = { connectToDatabase, getDb };
