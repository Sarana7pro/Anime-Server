const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const crypto = require('crypto');
const app = express();
const port = 3000;

// 使用 CORS 解决跨域问题，允许来自 Vue 前端的请求
app.use(cors({
  origin: 'http://localhost:8080'
}));

// 添加 JSON 解析中间件
app.use(express.json());

// 创建数据库连接池
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '123456',
  database: 'anime_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 检测数据库连接是否成功
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ 数据库连接失败:', err.message);
    process.exit(1); // 连接失败时退出程序
  } else {
    console.log('✅ 数据库连接成功');
    connection.release(); // 释放连接
  }
});

// 统计 API 调用次数
let totalRequests = 0; // 总调用次数
let requestsLast30Min = 0; // 过去30分钟的调用次数

// 每30分钟记录一次请求统计
setInterval(() => {
  console.log(`📊 过去30分钟 API 被调用 ${requestsLast30Min} 次`);
  requestsLast30Min = 0; // 计数重置
}, 30 * 60 * 1000);

// 记录 API 调用中间件
const countRequest = (req, res, next) => {
  totalRequests++;
  requestsLast30Min++;
  next();
};

// MD5 加密函数（加盐 "Sorana7"）
function md5Encrypt(password) {
  return crypto.createHash('md5').update(password + 'Sorana7').digest('hex');
}

// =========================
// 动漫接口（保持原有逻辑）
// =========================


/**
 * GET /api/random-anime
 * 功能：获取随机推荐的日本动漫列表
 * 参数：无
 * 返回：包含18条随机日本动漫的数组（ID、名称、封面图）
 * 注意：使用RAND()可能有性能问题，数据量过大时建议优化
 */

app.get('/api/random-anime', countRequest, (req, res) => {
  const query = `
    SELECT vod_id, vod_name, vod_pic 
    FROM mac_vod 
    WHERE vod_area = '日本'
    ORDER BY RAND()
    LIMIT 18
  `;
  pool.query(query, (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});

/**
 * GET /api/random-china-anime
 * 功能：获取随机推荐的大陆动漫列表
 * 参数：无
 * 返回：包含18条随机大陆动漫的数组（ID、名称、封面图）
 * 注意：数据范围限定为 vod_area = '大陆'
 */

app.get('/api/random-china-anime', countRequest, (req, res) => {
  const query = `
    SELECT vod_id, vod_name, vod_pic 
    FROM mac_vod 
    WHERE vod_area = '大陆'
    ORDER BY RAND()
    LIMIT 18
  `;
  pool.query(query, (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});


/**
 * GET /api/anime-movies
 * 功能：获取高清动漫电影推荐
 * 参数：无
 * 返回：包含18条随机动漫电影的数组（ID、名称、封面图）
 * 注意：筛选条件为 vod_remarks = 'HD'
 */

app.get('/api/anime-movies', countRequest, (req, res) => {
  const query = `
    SELECT vod_id, vod_name, vod_pic 
    FROM mac_vod 
    WHERE vod_remarks = 'HD'
    ORDER BY RAND()
    LIMIT 18
  `;
  pool.query(query, (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});

/**
 * GET /api/anime-detail/:id
 * 功能：获取指定动漫的详细信息
 * 参数：id - 动漫ID (URL参数)
 * 返回：完整动漫数据对象
 * 错误处理：404未找到/500数据库错误
 */

app.get('/api/anime-detail/:id', countRequest, (req, res) => {
  const id = req.params.id;
  const query = 'SELECT * FROM mac_vod WHERE vod_id = ? LIMIT 1';
  pool.query(query, [id], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'Anime not found' });
    }
    res.json(results[0]);
  });
});

/**
 * GET /api/japan-anime
 * 功能：分页获取所有日本动漫数据
 * 参数：page - 页码（默认1），pageSize - 每页数量（默认48）
 * 返回：分页数据（包含数据列表和分页信息）
 */
app.get('/api/japan-anime', countRequest, async (req, res) => {
  try {
    let page = parseInt(req.query.page) || 1;
    let pageSize = parseInt(req.query.pageSize) || 48; // 8x6=48条/页

    if (isNaN(page) || isNaN(pageSize) || page < 1 || pageSize < 1) {
      return res.status(400).json({ error: "无效的分页参数" });
    }
    const offset = (page - 1) * pageSize;
    const promisePool = pool.promise();
    const [countResults, dataResults] = await Promise.all([
      promisePool.query(
        "SELECT COUNT(vod_id) AS total FROM mac_vod WHERE vod_area = ?",
        ["日本"]
      ),
      promisePool.query(
        `SELECT vod_id, vod_name, vod_pic 
         FROM mac_vod 
         WHERE vod_area = ? 
         LIMIT ? OFFSET ?`,
        ["日本", pageSize, offset]
      )
    ]);
    const total = countResults[0][0].total;
    const totalPages = Math.ceil(total / pageSize);
    res.json({
      data: dataResults[0],
      pagination: {
        currentPage: page,
        pageSize: pageSize,
        totalItems: total,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error("分页查询错误:", error);
    res.status(500).json({ error: "数据库查询失败" });
  }
});

/**
 * GET /api/china-anime
 * 功能：分页获取所有大陆动漫数据
 * 参数：page - 页码（默认1），pageSize - 每页数量（默认48）
 * 返回：分页数据（包含数据列表和分页信息）
 */
app.get('/api/china-anime', countRequest, async (req, res) => {
  try {
    let page = parseInt(req.query.page) || 1;
    let pageSize = parseInt(req.query.pageSize) || 48;

    // 参数有效性校验
    if (isNaN(page) || isNaN(pageSize) || page < 1 || pageSize < 1) {
      return res.status(400).json({ error: "无效的分页参数" });
    }

    // 限制每页数量范围
    pageSize = Math.min(Math.max(pageSize, 10), 100);
    
    const offset = (page - 1) * pageSize;
    const promisePool = pool.promise();

    const [countResults, dataResults] = await Promise.all([
      promisePool.query(
        "SELECT COUNT(vod_id) AS total FROM mac_vod WHERE vod_area = ?",
        ["大陆"]
      ),
      promisePool.query(
        `SELECT vod_id, vod_name, vod_pic 
         FROM mac_vod 
         WHERE vod_area = ?
         ORDER BY vod_id DESC  -- 确保分页稳定性
         LIMIT ? OFFSET ?`,
        ["大陆", pageSize, offset]
      )
    ]);

    const total = countResults[0][0].total;
    const totalPages = Math.ceil(total / pageSize);

    res.json({
      data: dataResults[0],
      pagination: {
        currentPage: page,
        pageSize: pageSize,
        totalItems: total,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error("大陆动漫分页查询错误:", error);
    res.status(500).json({ error: "数据库查询失败" });
  }
});

/**
 * GET /api/hd-anime-movies
 * 功能：分页获取所有HD动漫电影
 * 参数：page - 页码（默认1），pageSize - 每页数量（默认48）
 * 返回：分页数据（包含数据列表和分页信息）
 */
app.get('/api/hd-anime-movies', countRequest, async (req, res) => {
  try {
    let page = parseInt(req.query.page) || 1;
    let pageSize = parseInt(req.query.pageSize) || 48;

    // 参数有效性校验
    if (isNaN(page) || isNaN(pageSize) || page < 1 || pageSize < 1) {
      return res.status(400).json({ error: "无效的分页参数" });
    }

    // 限制每页数量范围
    pageSize = Math.min(Math.max(pageSize, 10), 100);
    
    const offset = (page - 1) * pageSize;
    const promisePool = pool.promise();

    const [countResults, dataResults] = await Promise.all([
      promisePool.query(
        "SELECT COUNT(vod_id) AS total FROM mac_vod WHERE vod_remarks = ?",
        ["HD"]
      ),
      promisePool.query(
        `SELECT vod_id, vod_name, vod_pic 
         FROM mac_vod 
         WHERE vod_remarks = ?
         ORDER BY vod_id DESC  -- 确保分页稳定性
         LIMIT ? OFFSET ?`,
        ["HD", pageSize, offset]
      )
    ]);

    const total = countResults[0][0].total;
    const totalPages = Math.ceil(total / pageSize);

    res.json({
      data: dataResults[0],
      pagination: {
        currentPage: page,
        pageSize: pageSize,
        totalItems: total,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error("HD动漫分页查询错误:", error);
    res.status(500).json({ error: "数据库查询失败" });
  }
});

/**
 * GET /api/schedule
 * 功能：获取追番周表数据
 * 说明：根据管理员预置的关键词，查询每天更新的动漫，并返回对应的数据
 * 
 * 参数：无
 * 返回：
 * {
 *   "周一": [ { vod_id, vod_name, vod_pic }, ... ],
 *   "周二": [ { vod_id, vod_name, vod_pic }, ... ],
 *   ...
 * }
 */
app.get('/api/schedule', countRequest, async (req, res) => {
  try {
    const promisePool = pool.promise();
    // 管理员预置的配置，多个关键词使用逗号分隔（关键词须正确，否则查询不到）
    const scheduleConfig = {
      "周一": "平凡职业造就世界最强第三季,平凡上班族到异世界当上了四天王的故事,我的幸福婚约第二季,魔法使的约定,这公司有我喜欢的人,转生成猫的大叔,稗记舞咏",
      "周二": "无名记忆第二季,我的可爱对黑岩目高不管用,",
      "周三": "群花绽放,彷如修罗终有一天会成为最强的炼金术师？,Re：从零开始的异世界生活第三季反击篇,",
      "周四": "不幸职业【鉴定士】实则最强,BanG Dream! Ave Mujica,石纪元第四季,天久鹰央的推理病历表,蜂蜜柠檬苏打动画版,",
      "周五": "欢迎来到日本，精灵小姐。,魔农传记,黄昏旅店,MOMENTARY LILY 刹那之花,终究、与你相恋。,中年大叔转生反派千金,",
      "周六": "坂本日常,我和班上最讨厌的女生结婚了。,S级怪兽《贝希摩斯》被误认成小猫，成为精灵女孩的骑士(宠物)一起生活,一杆青空2025,虽然是公会的前台小姐，因为讨厌加班，所以打算自己讨伐boss,药屋少女的呢喃第二季",
      "周日": "想摆脱公主教育的我,在冲绳喜欢上的女孩子方言讲太多太棘手了,超超超超超喜欢你的100个女朋友第二季,离开A级队伍的我，和从前的弟子往迷宫深处迈进,金牌得主,香格里拉·开拓异境～粪作猎手挑战神作～第二季"
    };

    const scheduleResult = {};
    for (const day in scheduleConfig) {
      const keywordsStr = scheduleConfig[day];
      if (!keywordsStr) {
        scheduleResult[day] = [];
        continue;
      }
      const keywords = keywordsStr.split(',').map(k => k.trim()).filter(Boolean);
      let query = 'SELECT vod_id, vod_name, vod_pic FROM mac_vod WHERE ';
      query += keywords.map(() => "vod_name LIKE ?").join(' OR ');
      query += " LIMIT 5";
      const params = keywords.map(keyword => `%${keyword}%`);
      const [rows] = await promisePool.query(query, params);
      scheduleResult[day] = rows;
    }
    res.json(scheduleResult);
  } catch (error) {
    console.error("Schedule query error:", error);
    res.status(500).json({ error: "数据库查询失败" });
  }
});


// =========================
// 用户认证接口（登录/注册）
// =========================

/**
 * POST /api/register
 * 功能：用户注册接口
 * 参数：username, password (JSON body)
 * 返回：注册成功信息及用户ID
 * 安全：密码使用MD5加盐加密（盐值：Sorana7）
 * 校验：用户名唯一性检查（409冲突状态码）
 */

app.post('/api/register', countRequest, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码必填' });
  }
  // 先检查用户名是否已存在
  const checkQuery = 'SELECT id FROM users WHERE username = ? LIMIT 1';
  pool.query(checkQuery, [username], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: '数据库错误' });
    }
    if (results.length > 0) {
      return res.status(409).json({ error: '该用户名已存在' });
    }
    const encryptedPassword = md5Encrypt(password);
    const query = 'INSERT INTO users (username, password) VALUES (?, ?)';
    pool.query(query, [username, encryptedPassword], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: '数据库错误' });
      }
      res.json({ message: '注册成功', userId: result.insertId });
    });
  });
});

/**
 * POST /api/login
 * 功能：用户登录接口
 * 参数：username, password (JSON body)
 * 返回：登录成功信息及用户数据（不含密码）
 * 安全：返回数据已删除敏感字段
 * 错误：401未授权状态码
 */

app.post('/api/login', countRequest, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码必填' });
  }
  const encryptedPassword = md5Encrypt(password);
  const query = 'SELECT * FROM users WHERE username = ? AND password = ? LIMIT 1';
  pool.query(query, [username, encryptedPassword], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: '数据库错误' });
    }
    if (results.length === 0) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const user = results[0];
    // 为安全起见，不返回密码字段
    delete user.password;
    res.json({ message: '登录成功', user });
  });
});

// =========================
// 新功能接口：消息、收藏、观看历史
// =========================

/**
 * GET /api/user/messages
 * 功能：获取用户消息列表
 * 参数：userId (查询参数)
 * 返回：消息数组（未登录返回默认欢迎消息）
 * 注意：消息数据存储为JSON字符串，需解析处理
 */

app.get('/api/user/messages', countRequest, (req, res) => {
  const { userId } = req.query;
  if (userId) {
    const query = 'SELECT messages FROM users WHERE id = ? LIMIT 1';
    pool.query(query, [userId], (error, results) => {
      if (error) {
        console.error(error);
        return res.status(500).json({ error: '数据库错误' });
      }
      if (results.length === 0) {
        return res.status(404).json({ error: '用户不存在' });
      }
      let messages = results[0].messages;
      try {
        messages = JSON.parse(messages);
      } catch (e) {
        messages = messages || [];
      }
      res.json(messages);
    });
  } else {
    // 未登录返回默认消息
    res.json([{ id: 1, content: '欢迎来到本站，请先登录以获得更多服务。' }]);
  }
});

/**
 * GET /api/user/favorites
 * 功能：获取用户收藏列表
 * 参数：userId (查询参数)
 * 返回：收藏数组（未登录返回空数组）
 * 存储：最多保留50条收藏记录
 */

app.get('/api/user/favorites', countRequest, (req, res) => {
  const { userId } = req.query;
  if (userId) {
    const query = 'SELECT favorites FROM users WHERE id = ? LIMIT 1';
    pool.query(query, [userId], (error, results) => {
      if (error) {
        console.error(error);
        return res.status(500).json({ error: '数据库错误' });
      }
      if (results.length === 0) {
        return res.status(404).json({ error: '用户不存在' });
      }
      let favorites = results[0].favorites;
      try {
        favorites = JSON.parse(favorites);
      } catch (e) {
        favorites = favorites || [];
      }
      res.json(favorites);
    });
  } else {
    // 未登录返回空数组或默认数据
    res.json([]);
  }
});

/**
 * GET /api/user/watch-history
 * 功能：获取用户观看历史
 * 参数：userId (查询参数)
 * 返回：观看历史数组（未登录返回空数组）
 * 存储：最多保留20条历史记录
 */

app.get('/api/user/watch-history', countRequest, (req, res) => {
  const { userId } = req.query;
  if (userId) {
    const query = 'SELECT watch_history FROM users WHERE id = ? LIMIT 1';
    pool.query(query, [userId], (error, results) => {
      if (error) {
        console.error(error);
        return res.status(500).json({ error: '数据库错误' });
      }
      if (results.length === 0) {
        return res.status(404).json({ error: '用户不存在' });
      }
      let watchHistory = results[0].watch_history;
      try {
        watchHistory = JSON.parse(watchHistory);
      } catch (e) {
        watchHistory = watchHistory || [];
      }
      res.json(watchHistory);
    });
  } else {
    // 未登录返回空数组或默认数据
    res.json([]);
  }
});

/**
 * POST /api/user/watch-history
 * 功能：更新用户观看历史
 * 参数：userId, video (JSON body)
 * 逻辑：去重处理，添加时间戳，限制记录数量
 * 注意：video对象需包含videoId属性
 */

app.post('/api/user/watch-history', countRequest, (req, res) => {
  const { userId, video } = req.body;
  if (!userId || !video) {
    return res.status(400).json({ error: 'userId 和 video 参数必填' });
  }
  // 先查询当前用户的观看历史
  const querySelect = 'SELECT watch_history FROM users WHERE id = ? LIMIT 1';
  pool.query(querySelect, [userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: '数据库错误' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    let watchHistory = [];
    if (results[0].watch_history) {
      try {
        watchHistory = JSON.parse(results[0].watch_history);
      } catch (e) {
        watchHistory = [];
      }
    }
    // 如果已存在相同视频则先移除
    watchHistory = watchHistory.filter(item => item.videoId !== video.videoId);
    // 添加当前记录，并记录观看时间
    video.watchedAt = new Date().toISOString();
    watchHistory.unshift(video);
    // 限制最多保留 20 条记录
    if (watchHistory.length > 20) {
      watchHistory = watchHistory.slice(0, 20);
    }
    // 更新用户观看历史
    const queryUpdate = 'UPDATE users SET watch_history = ? WHERE id = ?';
    pool.query(queryUpdate, [JSON.stringify(watchHistory), userId], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: '数据库错误' });
      }
      res.json({ message: '观看历史已更新', watchHistory });
    });
  });
});

/**
 * POST /api/user/favorites
 * 功能：添加/移除用户收藏
 * 参数：userId, video (JSON body)
 * 逻辑：存在则删除，不存在则添加
 * 返回：更新后的收藏数组
 */

app.post("/api/user/favorites", countRequest, (req, res) => {
  const { userId, video } = req.body;
  if (!userId || !video) {
    return res.status(400).json({ error: "userId 和 video 参数必填" });
  }

  // 查询用户收藏列表
  const querySelect = "SELECT favorites FROM users WHERE id = ? LIMIT 1";
  pool.query(querySelect, [userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "数据库错误" });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: "用户不存在" });
    }

    let favorites = [];
    if (results[0].favorites) {
      try {
        favorites = JSON.parse(results[0].favorites);
      } catch (e) {
        favorites = [];
      }
    }

    // 检查是否已收藏
    const index = favorites.findIndex((item) => item.videoId === video.videoId);
    if (index !== -1) {
      // 已收藏，则取消收藏
      favorites.splice(index, 1);
    } else {
      // 未收藏，则添加
      favorites.unshift(video);
    }

    // 限制最多 50 条收藏
    if (favorites.length > 50) {
      favorites = favorites.slice(0, 50);
    }

    // 更新数据库
    const queryUpdate = "UPDATE users SET favorites = ? WHERE id = ?";
    pool.query(queryUpdate, [JSON.stringify(favorites), userId], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "数据库错误" });
      }
      res.json({ message: "收藏已更新", favorites });
    });
  });
});

// =========================
// 搜索接口
// =========================

/**
 * GET /api/search-anime
 * 功能：动漫搜索接口
 * 参数：q (查询参数，搜索关键词)
 * 返回：匹配的动漫数组（含标题、封面、简介）
 * 注意：使用LIKE模糊查询，性能敏感
 */

app.get('/api/search-anime', (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "请输入搜索关键词" });

  const query = `
    SELECT vod_id, vod_name, vod_pic, vod_content 
    FROM mac_vod 
    WHERE vod_name LIKE ? 
    LIMIT 20
  `;

  pool.query(query, [`%${q}%`], (error, results) => {
    if (error) {
      console.error("数据库搜索错误:", error);
      return res.status(500).json({ error: "数据库错误" });
    }
    res.json(results);
  });
});


// =========================
// 进程退出处理
// =========================

process.on('SIGINT', () => {
  console.log(`📈 服务器关闭，总 API 调用次数: ${totalRequests}`);
  process.exit();
});

// 启动服务器
app.listen(port, () => {
  console.log(`🚀 服务器已在 http://localhost:${port} 启动`);
});
