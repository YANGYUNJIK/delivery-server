const express = require('express');
const { connectToDatabase } = require('./db');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dbName = 'delivery';  // DB 이름 자유롭게 지정
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// MongoDB 연결
connectToDatabase();

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));

// 메모리 저장소
const items = [];
const orders = [];
const { ObjectId } = require('mongodb');
const { getDb } = require('./db');

// ✅ 항목 조회
app.get('/items', async (req, res) => {
  const { type } = req.query;
  const db = getDb();

  try {
    const query = type ? { type } : {};
    const items = await db.collection('items').find(query).toArray();

    res.json(items);
  } catch (error) {
    console.error('❌ 항목 조회 실패:', error);
    res.status(500).json({ error: 'DB 조회 실패' });
  }
});



// ✅ 항목 등록 (base64 이미지 또는 기본 이미지)
app.post('/items', upload.single('image'), async (req, res) => {
  const { name, type, imageBase64 } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error: '이름과 종류는 필수입니다.' });
  }

  const db = getDb();
  let imageUrl;

  try {
    if (req.file) {
      // 멀티파트로 받은 파일
      imageUrl = `http://192.168.0.111:3000/uploads/${req.file.filename}`;
    } else if (imageBase64) {
      // base64 문자열
      const filename = `${Date.now()}.jpg`;
      const filepath = path.join(uploadDir, filename);
      fs.writeFileSync(filepath, Buffer.from(imageBase64, 'base64'));
      imageUrl = `http://192.168.0.111:3000/uploads/${filename}`;
    } else {
      // 기본 이미지
      imageUrl = `http://192.168.0.111:3000/uploads/logo.png`;
    }

    const newItem = { name, type, image: imageUrl };
    await db.collection('items').insertOne(newItem);

    console.log('✅ 등록된 항목(MongoDB):', newItem);
    res.json({ success: true, item: newItem });

  } catch (error) {
    console.error('❌ 항목 등록 실패:', error);
    res.status(500).json({ error: 'DB 등록 실패' });
  }
});


// ✅ 항목 수정 (이름/종류/이미지)
app.patch('/items/:id', async (req, res) => {
  const db = getDb();
  const itemId = req.params.id;
  const { name, type, imageBase64 } = req.body;

  try {
    const item = await db.collection('items').findOne({ _id: new ObjectId(itemId) });
    if (!item) {
      return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });
    }

    const updateData = {};

    if (name) updateData.name = name;
    if (type) updateData.type = type;

    // 이미지가 바뀌었을 경우
    if (imageBase64) {
      // 이전 이미지 삭제 (logo.png 제외)
      const oldImageName = path.basename(item.image);
      if (oldImageName !== 'logo.png') {
        const oldPath = path.join(uploadDir, oldImageName);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      // 새 이미지 저장
      const newFileName = `${Date.now()}.jpg`;
      const newFilePath = path.join(uploadDir, newFileName);
      fs.writeFileSync(newFilePath, Buffer.from(imageBase64, 'base64'));

      updateData.image = `http://192.168.0.111:3000/uploads/${newFileName}`;
    }

    await db.collection('items').updateOne(
      { _id: new ObjectId(itemId) },
      { $set: updateData }
    );

    const updatedItem = await db.collection('items').findOne({ _id: new ObjectId(itemId) });
    console.log('✏️ 항목 수정 완료:', updatedItem);

    res.json({ success: true, item: updatedItem });
  } catch (err) {
    console.error('❌ 항목 수정 오류:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});


// ✅ 항목 삭제 + 이미지 제거
app.delete('/items/:id', async (req, res) => {
  const db = getDb();
  const itemId = req.params.id;

  try {
    const item = await db.collection('items').findOne({ _id: new ObjectId(itemId) });
    if (!item) {
      return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });
    }

    // 이미지 삭제
    const imagePath = path.join(uploadDir, path.basename(item.image));
    if (fs.existsSync(imagePath) && path.basename(item.image) !== 'logo.png') {
      fs.unlinkSync(imagePath);
    }

    await db.collection('items').deleteOne({ _id: new ObjectId(itemId) });

    console.log('🗑 항목 삭제 완료:', itemId);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ 삭제 오류:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});


// ✅ 주문 등록
app.post('/order', async (req, res) => {
  const { name, menu, quantity, type } = req.body;

  if (!name || !menu || !quantity || !type) {
    return res.status(400).json({ error: '주문 정보 누락' });
  }

  const newOrder = {
    name,
    menu,
    quantity,
    type,
    status: 'pending',
    createdAt: new Date(),
  };

  try {
    const db = getDb();
    const result = await db.collection('orders').insertOne(newOrder);
    console.log('📥 주문 등록 (MongoDB):', newOrder);
    res.json({ success: true, insertedId: result.insertedId });
  } catch (err) {
    console.error('❌ 주문 등록 실패:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});


// ✅ 주문 목록 조회 (학생용/선생님용)
app.get('/orders', async (req, res) => {
  const db = getDb();
  const { name } = req.query;

  try {
    const query = name ? { name } : {};
    const orderList = await db.collection('orders')
      .find(query)
      .sort({ createdAt: -1 }) // 최신순 정렬
      .toArray();

    res.json(orderList);
  } catch (err) {
    console.error('❌ 주문 조회 실패:', err);
    res.status(500).json({ error: '주문 조회 중 서버 오류' });
  }
});


// ✅ 주문 상태 변경 (수락/거절)
// ✅ 주문 상태 변경 (MongoDB 기반)
app.patch('/order/:id', async (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { status } = req.body;

  if (!status) return res.status(400).json({ error: '상태가 필요합니다.' });

  try {
    const result = await db.collection('orders').updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
    }

    console.log(`🔄 주문 상태 변경 완료: ${id} → ${status}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ 상태 변경 오류:', err);
    res.status(500).json({ error: 'DB 오류' });
  }
});



// ✅ 주문 수량 수정
// ✅ 주문 수량 수정 (학생 수정용)
app.patch('/orders/:id', async (req, res) => {
  const db = getDb();
  const orderId = req.params.id;
  const { quantity } = req.body;

  if (!quantity || isNaN(quantity)) {
    return res.status(400).json({ error: '수량이 올바르지 않습니다.' });
  }

  try {
    const result = await db.collection('orders').updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { quantity: parseInt(quantity) } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
    }

    console.log('✏️ 주문 수량 수정 완료:', orderId);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ 수량 수정 오류:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});


// ✅ 주문 삭제
// ✅ 주문 삭제
app.delete('/orders/:id', async (req, res) => {
  const db = getDb();
  const orderId = req.params.id;

  try {
    const result = await db.collection('orders').deleteOne({ _id: new ObjectId(orderId) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
    }

    console.log('🗑 주문 삭제 완료:', orderId);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ 주문 삭제 오류:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});


// ✅ 서버 시작
app.listen(PORT, () => {
  console.log(`✅ Server running on http://192.168.0.111:${PORT}`);
});