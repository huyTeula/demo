const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const dbConfig = require("./dbconfig");
const bcrypt = require("bcrypt");
const saltRounds = 13; // Số lần mã hóa, càng cao thì bảo mật càng cao nhưng sẽ chậm hơn
const app = express();
const path = require('path');
const port = 3001;
const JWT_SECRET = "your_jwt_secret_key"; // Khóa bí mật để tạo JWT

app.use(cors({
  origin: ['http://localhost:4200','http://localhost:5000','http://10.10.0.182:8085','https://tranuoc.phattien.net'], // Địa chỉ của client
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Các phương thức HTTP được phép
  allowedHeaders: ['Content-Type', 'Authorization'], // Các header được phép
  credentials: true, // Cho phép gửi cookie, nếu cần
  preflightContinue: false,
}));
// Thêm xử lý thủ công cho preflight requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(204); 
});

// Để có thể nhận dữ liệu JSON
app.use(express.json({ limit: "10mb" })); // Thay đổi giới hạn là 10 MB

async function connectToDatabase() {
  try {
    await sql.connect(dbConfig);
    console.log("Kết nối thành công tới SQL Server!");
  } catch (err) {
    console.error("Kết nối thất bại:", err);
  }
}
// Lấy danh sách khách hàng cho danh sách khách hàng
app.get('/api/khach-hang', async (req, res) => {
  try {
    const result = await sql.query`
      -- Lấy danh sách TenKH, BienSo từ cả KhachHang và HoaDon
      WITH KhachHangList AS (
        -- Lấy từ bảng KhachHang
        SELECT TenKH, BienSo
        FROM KhachHang
        WHERE TenKH IS NOT NULL AND BienSo IS NOT NULL
        UNION
        -- Lấy từ bảng HoaDon
        SELECT TenKH, BienSo
        FROM HoaDon
        WHERE TenKH IS NOT NULL AND BienSo IS NOT NULL
      )
      -- Đếm tổng số hóa đơn và sắp xếp theo tên cuối
      SELECT 
        kh.TenKH,
        kh.BienSo,
        COUNT(hd.HoaDonId) AS TongHoaDon,
        MIN(khach.TenKH) AS TenKH_KhachHang,
        MIN(khach.SDT) AS SDT,
        MIN(khach.NgayTao) AS NgayTao
      FROM KhachHangList kh
      LEFT JOIN HoaDon hd ON kh.TenKH = hd.TenKH AND kh.BienSo = hd.BienSo
      LEFT JOIN KhachHang khach ON kh.TenKH = khach.TenKH AND kh.BienSo = khach.BienSo
      GROUP BY kh.TenKH, kh.BienSo
      -- Sắp xếp theo tên cuối (từ cuối cùng trong TenKH)
      ORDER BY PARSENAME(REPLACE(kh.TenKH, ' ', '.'), 1) ASC;
    `;

    res.json(result.recordset);
  } catch (err) {
    console.error("Lỗi khi lấy dữ liệu:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// Lấy tất cả các món ăn
app.get("/api/menu", async (req, res) => {
  try {
    const result = await sql.query`SELECT * FROM Menu`;
    const menuItems = result.recordset;

    res.json(menuItems); // Trả dữ liệu bao gồm HinhAnh dạng base64
  } catch (err) {
    console.error("Lỗi khi lấy danh sách món ăn:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

//Thêm món ăn
app.post("/api/menu", async (req, res) => {
  const { TenMonAn, NgayHieuLuc, NgayHetHieuLuc, HinhAnh } = req.body;

  try {
    // Tính toán tình trạng hiệu lực
    const TinhTrang = new Date(NgayHetHieuLuc) >= new Date() ? "Còn hiệu lực" : "Hết hiệu lực";

    // Lưu hình ảnh base64 nguyên vẹn, bao gồm tiền tố
    let imageBuffer = null;
    if (HinhAnh) {
      imageBuffer = HinhAnh; // Giữ nguyên chuỗi base64 với tiền tố
    }

    // Thêm món ăn vào cơ sở dữ liệu
    await sql.query`
      INSERT INTO Menu (TenMonAn, NgayHieuLuc, NgayHetHieuLuc, TinhTrang, HinhAnh)
      VALUES (${TenMonAn}, ${NgayHieuLuc}, ${NgayHetHieuLuc}, ${TinhTrang}, ${imageBuffer})
    `;

    res.status(201).json({ message: "Thêm món ăn thành công" });
  } catch (err) {
    console.error("Lỗi khi thêm món ăn:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

//Sửa món ăn
app.put("/api/menu/:id", async (req, res) => {
  const { id } = req.params;
  const { TenMonAn, NgayHieuLuc, NgayHetHieuLuc, HinhAnh } = req.body;

  try {
    // Tính toán tình trạng hiệu lực
    const TinhTrang = new Date(NgayHetHieuLuc) >= new Date() ? "Còn hiệu lực" : "Hết hiệu lực";

    // Lưu hình ảnh base64 nguyên vẹn, bao gồm tiền tố
    let imageBuffer = null;
    if (HinhAnh) {
      imageBuffer = HinhAnh; // Giữ nguyên chuỗi base64 với tiền tố
    }

    // Cập nhật món ăn trong cơ sở dữ liệu
    await sql.query`
      UPDATE Menu
      SET TenMonAn = ${TenMonAn}, 
          NgayHieuLuc = ${NgayHieuLuc}, 
          NgayHetHieuLuc = ${NgayHetHieuLuc}, 
          TinhTrang = ${TinhTrang}, 
          HinhAnh = ${imageBuffer ? imageBuffer : sql.Null}
      WHERE MenuId = ${id}
    `;

    res.status(200).json({ message: "Cập nhật món ăn thành công" });
  } catch (err) {
    console.error("Lỗi khi cập nhật món ăn:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Xóa món ăn
app.delete("/api/menu/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await sql.query(`DELETE FROM Menu WHERE MenuId = ${id}`);
    res.json({ message: "Xóa món ăn thành công" });
  } catch (err) {
    console.error("Lỗi khi xóa món ăn:", err);
    res.status(500).send("Lỗi server");
  }
});

// Xử lý đăng nhập admin
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Truy vấn bảng Admins để kiểm tra AdminName, AdminPassword và lấy RoleId
    const result = await sql.query`
      SELECT AdminId, AdminName, AdminPassword, RoleId 
      FROM Admins 
      WHERE AdminName = ${username} AND AdminPassword = ${password}
    `;
    const user = result.recordset[0];

    if (user) {
      // Tạo JWT token nếu thông tin đăng nhập chính xác
      const tokenPayload = {
        id: user.AdminId,
        username: user.AdminName,
        roleId: user.RoleId, // Thêm RoleId vào payload để phân quyền
        userType: "admin", // Định nghĩa loại người dùng là admin
      };
      const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "7d" });
      res.json({ message: "Đăng nhập thành công", token });
    } else {
      res.status(401).json({ message: "Tài khoản hoặc mật khẩu không chính xác" });
    }
  } catch (err) {
    console.error("Lỗi khi xử lý đăng nhập:", err);
    res.status(500).send("Lỗi server");
  }
});

// Middleware để xác thực JWT
function authenticateToken(req, res, next) {
  const token = req.headers["authorization"];

  if (!token) return res.sendStatus(403); // Không có token, từ chối truy cập

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}
//Thay đổi mật khẩu
app.post('/api/forgot-password', async (req, res) => {
  const { SDT, username, newPassword } = req.body; // Lấy mật khẩu mới từ người dùng
  try {
    const result = await sql.query`SELECT * FROM KhachHang WHERE SDT = ${SDT} AND UserName = ${username}`;
      const user = result.recordset[0];
        if (user)
          {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await sql.query`UPDATE KhachHang SET UserPassword = ${hashedPassword} WHERE KHId = ${user.KHId}`;
            res.json({ message: "Cập nhật mật khẩu thành công" });
          }
          else
            {
              res.status(404).json({ message: "Không tìm thấy người dùng với SDT và username này" });
            }
  }
  catch(err)
    {
      console.error("Lỗi server:", err)
      res.status(500).send("Lỗi server")
    }
});
//Đăng ký
app.post("/api/register", async (req, res) => {
  const { name, phone, plate, username, password } = req.body;

  try {
    // Kiểm tra xem tên đăng nhập đã tồn tại chưa
    const existingUser =
      await sql.query`SELECT * FROM KhachHang WHERE UserName = ${username}`;
    if (existingUser.recordset.length > 0) {
      return res.status(400).json({ message: "Tên đăng nhập đã tồn tại" });
    }

    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Thêm người dùng mới vào CSDL với mật khẩu đã mã hóa
    await sql.query`
      INSERT INTO KhachHang (TenKH, SDT, BienSo, UserName, UserPassword, NgayTao)
      VALUES (${name}, ${phone}, ${plate}, ${username}, ${hashedPassword}, GETDATE())
    `;

    res.status(201).json({ message: "Đăng ký thành công" });
  } catch (err) {
    console.error("Lỗi khi đăng ký:", err);
    res.status(500).send({ message: "Đăng ký thất bại" });
  }
});
// Tạo hoá đơn
app.post("/api/hoa-don", async (req, res) => {
  const { KHId, TenKH, BienSo, SoThe, items } = req.body; // Thêm SoThe vào destructuring
  try {
    // Bắt đầu transaction
    const transaction = new sql.Transaction();
    await transaction.begin();

    try {
      // Tạo hóa đơn trong bảng HoaDon
      const result = await sql.query`
        INSERT INTO HoaDon (NgayThucHien, TenKH, BienSo, SoThe, KHId) 
        OUTPUT INSERTED.HoaDonId
        VALUES (GETDATE(), ${TenKH}, ${BienSo}, ${SoThe}, ${KHId});
      `;

      const hoaDonId = result.recordset[0].HoaDonId;

      // Thêm chi tiết hóa đơn vào bảng ChiTietHoaDon
      for (const item of items) {
        await sql.query`
          INSERT INTO ChiTietHoaDon (HoaDonId, TenMonAn, SoLuong, GhiChu) 
          VALUES (${hoaDonId}, ${item.TenMonAn}, ${item.SoLuong}, ${item.GhiChu});
        `;
      }

      // Commit transaction nếu mọi thứ thành công
      await transaction.commit();
      console.log("Hóa đơn tạo thành công với HoaDonId:", hoaDonId);

      // Kiểm tra xem khách hàng có trong bảng KhachVangLai không
      const khachVangLaiCheck = await sql.query`
        SELECT KVLId
        FROM KhachVangLai
        WHERE TenKVL = ${TenKH} AND BienSoKVL = ${BienSo};
      `;

      if (khachVangLaiCheck.recordset.length > 0) {
        // Nếu tồn tại, xóa khỏi bảng KhachVangLai
        const deleteResult = await sql.query`
          DELETE FROM KhachVangLai
          WHERE TenKVL = ${TenKH} AND BienSoKVL = ${BienSo};
        `;
        console.log("Rows deleted from KhachVangLai:", deleteResult.rowsAffected[0]);
      } else {
        console.log("Khách hàng không tồn tại trong KhachVangLai, bỏ qua:", { TenKH, BienSo });
      }

      // Trả về phản hồi thành công
      res.status(201).json({ message: "Hóa đơn tạo thành công" });
    } catch (error) {
      // Rollback transaction nếu có lỗi
      await transaction.rollback();
      console.error("Lỗi tạo hoá đơn:", error);
      res.status(500).json({ message: "Lỗi server khi tạo hóa đơn" });
    }
  } catch (transactionError) {
    console.error("Transaction error:", transactionError);
    res.status(500).json({ message: "Lỗi server khi tạo hóa đơn" });
  }
});

// Lấy hoá đơn hiển thị
app.get("/api/hoa-don", async (req, res) => {
  try {
    const hoaDons = [];
    const result = await sql.query`
      SELECT hd.HoaDonId,
      CONVERT(VARCHAR, hd.NgayThucHien, 120) AS NgayThucHien,
      hd.TenKH, hd.BienSo, hd.SoThe, hd.TrangThai
      FROM HoaDon hd
      ORDER BY hd.NgayThucHien DESC
    `;

    for (const row of result.recordset) {
      const chitietResult = await sql.query`
        SELECT TenMonAn, SoLuong, GhiChu FROM ChiTietHoaDon
        WHERE HoaDonId = ${row.HoaDonId}
      `;
      // Xử lý trạng thái: nếu TrangThai là null, trả về "Đang thực hiện"
      const trangThai = row.TrangThai === 'HoanThanh' ? 'Hoàn thành' : 'Đang thực hiện';
      hoaDons.push({ ...row, TrangThai: trangThai, ChiTiet: chitietResult.recordset });
    }

    res.json(hoaDons);
  } catch (error) {
    console.error("Lỗi lấy hoá đơn:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});
// Cập nhật trạng thái của hóa đơn
app.put("/api/hoa-don/:id", async (req, res) => {
  const { id } = req.params;
  const { TrangThai } = req.body;

  try {
    const result = await sql.query`
      UPDATE HoaDon
      SET TrangThai = ${TrangThai}
      WHERE HoaDonId = ${id};
    `;

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Hóa đơn không tồn tại" });
    }

    res.status(200).json({ message: "Cập nhật trạng thái thành công" });
  } catch (error) {
    console.error("Lỗi khi cập nhật trạng thái hóa đơn:", error);
    res.status(500).json({ message: "Lỗi server khi cập nhật trạng thái" });
  }
});
// Get Loai
app.get("/api/loai", async (req, res) => {
  const loai = req.query.loai; // Sử dụng query parameter `loai` để phù hợp với cú pháp chuẩn

  if (!loai) {
    return res.status(400).json({ error: "Thiếu giá trị Loai trong yêu cầu." });
  }

  try {
    // Truy vấn lấy các lưu ý dựa trên `Loai`
    const result = await sql.query`
      SELECT TenLoai FROM Loai WHERE Loai = ${loai}
    `;

    // Trả về danh sách `TenLoai` dưới dạng mảng
    const loaiOptions = result.recordset.map((row) => row.TenLoai);
    res.json(loaiOptions);
  } catch (err) {
    console.error("Lỗi khi lấy lưu ý:", err);
    res.status(500).json({ error: "Lỗi server khi lấy lưu ý." });
  }
});
// Danh sách khách hàng ở trạng thái chờ
app.get("/api/list-khach-hang", async (req, res) => {
  try {
    const customers = [];

    // Truy vấn bảng KhachVangLai để lấy thông tin khách hàng, bao gồm SoThe
    const khachVangLaiResult = await sql.query`
      SELECT KVLId, TenKVL, BienSoKVL, SoThe, TrangThaiKVL
      FROM KhachVangLai
      WHERE TenKVL IS NOT NULL AND BienSoKVL IS NOT NULL;
    `;

    // Duyệt qua từng khách hàng từ bảng KhachVangLai
    for (const kh of khachVangLaiResult.recordset) {
      const tenKH = kh.TenKVL;
      const bienSo = kh.BienSoKVL;
      const soThe = kh.SoThe || ''; // Lấy SoThe, mặc định là chuỗi rỗng nếu không có

      // Khởi tạo thông tin cơ bản
      let monAnNhieuNhat = [];
      let ghiChu = [];

      // Kiểm tra xem khách hàng có thông tin trong HoaDon và ChiTietHoaDon không
      const hoaDonCheck = await sql.query`
        SELECT HoaDonId
        FROM HoaDon
        WHERE TenKH = ${tenKH} AND BienSo = ${bienSo};
      `;

      if (hoaDonCheck.recordset.length > 0) {
        // Truy vấn để lấy chi tiết hóa đơn của khách hàng này
        const chiTietHoaDon = await sql.query`
          SELECT cthd.TenMonAn, cthd.GhiChu
          FROM ChiTietHoaDon cthd
          JOIN HoaDon hd ON cthd.HoaDonId = hd.HoaDonId
          WHERE hd.TenKH = ${tenKH} AND hd.BienSo = ${bienSo};
        `;

        // Đếm số lượng món ăn và gom nhóm theo TenMonAn, lưu ghi chú
        const monAnCount = chiTietHoaDon.recordset.reduce((acc, item) => {
          const monAn = item.TenMonAn;
          if (!acc[monAn]) {
            acc[monAn] = { count: 0, ghiChu: item.GhiChu || '' };
          }
          acc[monAn].count += 1;
          return acc;
        }, {});

        // Chuyển đổi thành mảng để tìm hai món ăn được gọi nhiều nhất
        const monAnArray = Object.keys(monAnCount).map((tenMonAn) => ({
          TenMonAn: tenMonAn,
          SoLuong: monAnCount[tenMonAn].count,
          GhiChu: monAnCount[tenMonAn].ghiChu,
        }));

        // Sắp xếp theo số lượng giảm dần và lấy hai món ăn nhiều nhất
        const topMonAn = monAnArray
          .sort((a, b) => b.SoLuong - a.SoLuong)
          .slice(0, 2);

        // Nếu không có món nào, gán giá trị mặc định
        if (topMonAn.length === 0) {
          monAnNhieuNhat = ['', ''];
          ghiChu = ['', ''];
        } else if (topMonAn.length === 1) {
          monAnNhieuNhat = [topMonAn[0].TenMonAn, ''];
          ghiChu = [topMonAn[0].GhiChu, ''];
        } else {
          monAnNhieuNhat = [topMonAn[0].TenMonAn, topMonAn[1].TenMonAn];
          ghiChu = [topMonAn[0].GhiChu, topMonAn[1].GhiChu];
        }
      } else {
        console.log(`No HoaDon found for customer: ${tenKH}, ${bienSo}`);
        monAnNhieuNhat = ['', ''];
        ghiChu = ['', ''];
      }

      // Thêm thông tin khách hàng, bao gồm SoThe
      customers.push({
        TenKH: tenKH,
        BienSo: bienSo,
        SoThe: soThe, // Thêm SoThe vào dữ liệu trả về
        MonAnNhieuNhat: monAnNhieuNhat,
        GhiChu: ghiChu,
      });
    }

    res.json(customers);
  } catch (error) {
    console.error("Lỗi khi lấy dữ liệu khách hàng:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});
//Hàm thực hiện chuyển khách hàng từ danh sách chờ sang danh sách huỷ
app.post("/api/move-to-cancelled", async (req, res) => {
  try {
    const { TenKH, BienSo, SoThe } = req.body; // Lấy thông tin khách hàng từ body
    console.log("Received request to /move-to-cancelled with data:", { TenKH, BienSo });

    // Kiểm tra dữ liệu đầu vào
    if (!TenKH || !BienSo) {
      return res.status(400).json({ message: "Thiếu thông tin tên khách hàng hoặc biển số" });
    }

    // Chuẩn hóa dữ liệu (loại bỏ khoảng trắng)
    const tenKHToUse = TenKH.trim();
    const bienSoToUse = BienSo.trim();
    const soTheToUse = SoThe || ''; // Chuyển SoThe thành chuỗi rỗng nếu không có
    // Kiểm tra xem khách hàng đã tồn tại trong KhachHang chưa
    const khachHangCheck = await sql.query`
      SELECT TenKH, BienSo, SoThe, TrangThai
      FROM KhachHang
      WHERE TenKH = ${tenKHToUse} AND SoThe = ${soTheToUse} AND BienSo = ${bienSoToUse};
    `;

    // Nếu chưa tồn tại, chèn vào bảng KhachHang với TrangThai = 'Huỷ'
    if (khachHangCheck.recordset.length === 0) {
      await sql.query`
        INSERT INTO KhachHang (TenKH, BienSo, SoThe, TrangThai)
        VALUES (${tenKHToUse}, ${bienSoToUse}, ${soTheToUse} ,'Huỷ');
      `;
      console.log("Inserted new customer into KhachHang with TrangThai = 'Huỷ':", { tenKHToUse, bienSoToUse });
    } else {
      // Nếu đã tồn tại, cập nhật TrangThai thành 'Huỷ' (không quan tâm giá trị hiện tại)
      await sql.query`
        UPDATE KhachHang
        SET TrangThai = 'Huỷ'
        WHERE TenKH = ${tenKHToUse} AND ${soTheToUse} AND BienSo = ${bienSoToUse};
      `;
      console.log("Updated TrangThai to 'Huỷ' in KhachHang:", { tenKHToUse, bienSoToUse });
    }

    // Xóa khách hàng khỏi bảng KhachVangLai sau khi đã chuyển sang KhachHang
    const deleteResult = await sql.query`
      DELETE FROM KhachVangLai
      WHERE TenKVL = ${tenKHToUse} AND BienSoKVL = ${bienSoToUse} AND SoThe= ${soTheToUse};
    `;
    console.log("Rows deleted from KhachVangLai:", deleteResult.rowsAffected[0]);

    // Trả về phản hồi thành công
    res.json({ message: "Khách hàng đã được chuyển sang danh sách bị huỷ" });
  } catch (error) {
    console.error("Lỗi khi chuyển khách hàng sang danh sách bị huỷ:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});
//Danh sách khách hàng ở trạng thái huỷ
app.get("/api/list-khach-hang-huy", async (req, res) => {
  try {
    const cancelledCustomers = [];

    // Truy vấn bảng KhachHang để lấy danh sách khách hàng bị huỷ
    const result = await sql.query`
      SELECT TenKH, BienSo, SoThe
      FROM KhachHang
      WHERE TrangThai = 'Huỷ' AND TenKH IS NOT NULL AND BienSo IS NOT NULL;
    `;

    for (const kh of result.recordset) {
      // Vì chưa có hóa đơn, không truy vấn ChiTietHoaDon
      cancelledCustomers.push({
        TenKH: kh.TenKH,
        BienSo: kh.BienSo,
        SoThe: kh.SoThe || '', // Thêm SoThe vào dữ liệu trả về
        MonAnNhieuNhat: '', // Chưa có hóa đơn, để trống
        GhiChu: '', // Chưa có hóa đơn, để trống
      });
    }

    res.json(cancelledCustomers);
  } catch (error) {
    console.error("Lỗi khi lấy danh sách khách hàng bị huỷ:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});
//Hàm thực hiện chuyển khách hàng từ danh sách huỷ sang danh sách chờ
app.post("/api/restore-to-waiting", async (req, res) => {
  try {
    const { TenKH, BienSo, SoThe } = req.body; // Lấy thông tin khách hàng từ body
    console.log("Received request to /restore-to-waiting with data:", { TenKH, BienSo, SoThe });

    // Kiểm tra dữ liệu đầu vào
    if (!TenKH || !BienSo || !SoThe) {
      return res.status(400).json({ message: "Thiếu thông tin tên khách hàng hoặc biển số" });
    }

    // Chuẩn hóa dữ liệu (loại bỏ khoảng trắng)
    const tenKHToUse = TenKH.trim();
    const bienSoToUse = BienSo.trim();
    const soTheToUse = SoThe || ''; // Chuyển SoThe thành chuỗi rỗng nếu không có
    // Kiểm tra xem khách hàng có trong bảng KhachHang không
    const khachHangCheck = await sql.query`
      SELECT TenKH, BienSo, SoThe
      FROM KhachHang
      WHERE TenKH = ${tenKHToUse} AND SoThe = ${soTheToUse} AND BienSo = ${bienSoToUse};
    `;

    if (khachHangCheck.recordset.length === 0) {
      return res.status(404).json({ message: "Khách hàng không tồn tại trong danh sách bị huỷ" });
    }

    // Xóa khách hàng khỏi bảng KhachHang
    const deleteResult = await sql.query`
      DELETE FROM KhachHang
      WHERE TenKH = ${tenKHToUse} AND BienSo = ${bienSoToUse} AND SoThe = ${soTheToUse};
    `;
    console.log("Rows deleted from KhachHang:", deleteResult.rowsAffected[0]);

    // Thêm lại khách hàng vào bảng KhachVangLai với TrangThaiKVL = NULL
    await sql.query`
      INSERT INTO KhachVangLai (TenKVL, BienSoKVL, SoThe , TrangThaiKVL)
      VALUES (${tenKHToUse}, ${bienSoToUse}, ${soTheToUse} ,NULL);
    `;
    console.log("Inserted customer back to KhachVangLai with TrangThaiKVL = NULL:", { tenKHToUse, bienSoToUse });

    // Trả về phản hồi thành công
    res.json({ message: "Khách hàng đã được chuyển trở lại danh sách chờ" });
  } catch (error) {
    console.error("Lỗi khi chuyển khách hàng trở lại danh sách chờ:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});
// Lấy danh sách hóa đơn của khách hàng theo tên khách hàng
app.get('/api/hoa-don/khach-hang/:TenKH', async (req, res) => {
  const TenKH = req.params.TenKH;
  try {
    const result = await sql.query`
      SELECT 
          hd.HoaDonId,
          FORMAT(hd.NgayThucHien, 'yyyy-MM-dd HH:mm:ss') AS NgayThucHien, 
          hd.TenKH,
          hd.BienSo,
          cthd.TenMonAn,
          cthd.SoLuong,
          cthd.GhiChu
      FROM HoaDon hd
      LEFT JOIN ChiTietHoaDon cthd ON hd.HoaDonId = cthd.HoaDonId
      WHERE hd.TenKH = ${TenKH}
      ORDER BY hd.NgayThucHien DESC;
    `;
    res.json(result.recordset);
  } catch (error) {
    console.error("Lỗi:", error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});
//Sửa hóa đơn
app.post('/api/update-hoa-don', async (req, res) => {
  const { HoaDonId, KHId, TenKH, BienSo, items } = req.body;
  try {
    // Kiểm tra dữ liệu đầu vào
    if (!HoaDonId) {
      return res.status(400).json({ message: "Thiếu HoaDonId để cập nhật hóa đơn" });
    }

    // Bắt đầu transaction
    const transaction = new sql.Transaction();
    await transaction.begin();

    try {
      // Cập nhật thông tin trong bảng HoaDon (ví dụ: cập nhật NgayThucHien)
      await sql.query`
        UPDATE HoaDon
        SET NgayThucHien = GETDATE(),
            TenKH = ${TenKH},
            BienSo = ${BienSo},
            KHId = ${KHId || null}
        WHERE HoaDonId = ${HoaDonId};
      `;

      // Xóa các bản ghi cũ trong ChiTietHoaDon của hóa đơn này
      await sql.query`
        DELETE FROM ChiTietHoaDon
        WHERE HoaDonId = ${HoaDonId};
      `;

      // Thêm lại danh sách món ăn mới vào ChiTietHoaDon
      for (const item of items) {
        await sql.query`
          INSERT INTO ChiTietHoaDon (HoaDonId, TenMonAn, SoLuong, GhiChu)
          VALUES (${HoaDonId}, ${item.TenMonAn}, ${item.SoLuong}, ${item.GhiChu || null});
        `;
      }

      await transaction.commit();
      console.log("Hóa đơn được cập nhật thành công với HoaDonId:", HoaDonId);
      res.status(200).json({ message: "Hóa đơn đã được cập nhật thành công" });
    } catch (error) {
      await transaction.rollback();
      console.error("Lỗi cập nhật hóa đơn:", error);
      res.status(500).json({ message: "Lỗi server khi cập nhật hóa đơn" });
    }
  } catch (transactionError) {
    console.error("Transaction error:", transactionError);
    res.status(500).json({ message: "Lỗi server khi cập nhật hóa đơn" });
  }
});

app.listen(port, '0.0.0.0', () => {
  connectToDatabase();
  console.log(`Server đang chạy tại http://localhost:${port}`);
});
