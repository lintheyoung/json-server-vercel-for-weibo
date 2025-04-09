// See https://github.com/typicode/json-server#module
const jsonServer = require('json-server')
const server = jsonServer.create()
const fs = require('fs')
const path = require('path')
const uuid = require('uuid')
const cors = require('cors')

// 判断是否在Vercel环境
const isVercel = process.env.VERCEL === '1';
let router;

if (isVercel) {
  // Vercel环境：使用内存数据
  const data = require('../db.json');
  router = jsonServer.router(data);
} else {
  // 本地环境：使用文件
  const filePath = path.join('db.json');
  router = jsonServer.router(filePath);
}

// 处理延迟阶段定义 - 保持与原来一致
const PROCESSING_STAGES = [
  { progress: 10, message: "正在下载视频资源", time: 2000 },
  { progress: 30, message: "正在添加水印", time: 3000 },
  { progress: 60, message: "正在生成无水印版本", time: 3000 },
  { progress: 80, message: "正在生成视频封面", time: 2000 },
  { progress: 95, message: "正在上传处理结果", time: 1000 },
  { progress: 100, message: "视频处理完成", time: 0 }
];

// 失败场景定义
const FAILURE_SCENARIOS = [
  { stage: 0, message: "下载视频资源失败，请检查网络连接" },
  { stage: 1, message: "水印添加失败，视频格式不兼容" },
  { stage: 2, message: "无水印版本生成失败，处理超时" },
  { stage: 3, message: "视频封面生成失败，素材分辨率过低" },
  { stage: 4, message: "上传处理结果失败，服务器存储空间不足" }
];

// 内存数据库
const inMemoryDb = {
  tasks: [],
  video_results: []
};

// 读取数据函数
function readData() {
  if (isVercel) {
    return JSON.parse(JSON.stringify(inMemoryDb));
  } else {
    try {
      const content = fs.readFileSync(path.join('db.json'), "utf8");
      return JSON.parse(content);
    } catch (error) {
      console.error("读取数据错误:", error);
      return { tasks: [], video_results: [] };
    }
  }
}

// 写入数据函数
function writeData(data) {
  if (isVercel) {
    // Vercel环境，更新内存数据
    inMemoryDb.tasks = data.tasks || [];
    inMemoryDb.video_results = data.video_results || [];
  } else {
    // 本地环境，写入文件
    try {
      fs.writeFileSync(path.join('db.json'), JSON.stringify(data, null, 2), "utf8");
    } catch (error) {
      console.error("写入数据错误:", error);
    }
  }
}

// 计算任务的时间线
function calculateTaskTimeline(taskId, willFail = false, failureStage = -1) {
  const timeline = [];
  let totalTime = 0;
  
  // 添加初始等待阶段
  timeline.push({
    status: "pending",
    progress: 0,
    message: "任务已提交，等待处理",
    timeOffset: 0
  });
  
  // 等待1秒后开始处理
  totalTime += 1000;
  
  // 添加处理阶段
  for (let i = 0; i < PROCESSING_STAGES.length; i++) {
    const stage = PROCESSING_STAGES[i];
    
    // 如果这是失败阶段，添加失败状态并结束
    if (willFail && i === failureStage) {
      const failureInfo = FAILURE_SCENARIOS[failureStage];
      timeline.push({
        status: "failed",
        progress: stage.progress,
        message: failureInfo.message,
        timeOffset: totalTime,
        error_code: 500 + failureStage
      });
      break;
    }
    
    // 添加正常处理阶段
    timeline.push({
      status: i === PROCESSING_STAGES.length - 1 ? "completed" : "processing",
      progress: stage.progress,
      message: stage.message,
      timeOffset: totalTime
    });
    
    totalTime += stage.time;
  }
  
  // 返回时间线和处理结果
  return {
    taskId,
    timeline,
    willFail,
    failureStage,
    startTime: Date.now()
  };
}

// 更新任务状态 - 仅在本地环境中使用
function updateTaskStatus(taskId, status, progress, message, result = null) {
  const db = readData();
  
  if (!db.tasks) db.tasks = [];
  if (!db.video_results) db.video_results = [];
  
  const taskIndex = db.tasks.findIndex(task => task.id === taskId);
  if (taskIndex === -1) return;
  
  db.tasks[taskIndex] = {
    ...db.tasks[taskIndex],
    status,
    progress,
    message,
    updatedAt: new Date().toISOString()
  };
  
  if ((status === "completed" || status === "failed") && result) {
    const resultId = uuid.v4();
    db.video_results.push({
      id: resultId,
      taskId: taskId,
      ...result
    });
    db.tasks[taskIndex].resultId = resultId;
  }
  
  writeData(db);
}

// 生成成功结果
function generateSuccessResult(taskId) {
  return {
    success: true,
    data: {
      watermarked_video: {
        url: "http://example.com/videos/video_with_watermark.mp4",
        cover: "http://example.com/covers/cover_with_watermark.jpg",
        duration: 120,
        format: "mp4"
      },
      non_watermarked_video: {
        url: "http://example.com/videos/video_without_watermark.mp4",
        cover: "http://example.com/covers/cover_without_watermark.jpg",
        duration: 120,
        format: "mp4"
      }
    },
    message: "视频处理成功"
  };
}

// 生成失败结果
function generateFailureResult(failureStage) {
  const failureInfo = FAILURE_SCENARIOS[failureStage];
  return {
    success: false,
    data: null,
    message: failureInfo.message,
    error_code: 500 + failureStage
  };
}

// 模拟本地视频处理过程
function processVideo(taskId, requestData) {
  if (isVercel) {
    // Vercel环境不应该调用这个函数
    console.error("Vercel环境不应使用processVideo函数");
    return;
  }
  
  updateTaskStatus(taskId, "processing", 0, "开始处理视频");
  
  let currentStage = 0;
  const willFail = Math.random() < 0.2;
  let failureStage = -1;
  
  if (willFail) {
    const randomFailure = FAILURE_SCENARIOS[Math.floor(Math.random() * FAILURE_SCENARIOS.length)];
    failureStage = randomFailure.stage;
  }
  
  function processNextStage() {
    if (currentStage === failureStage) {
      const failureResult = generateFailureResult(failureStage);
      updateTaskStatus(taskId, "failed", PROCESSING_STAGES[currentStage].progress, failureResult.message, failureResult);
      return;
    }
    
    if (currentStage >= PROCESSING_STAGES.length) {
      const result = generateSuccessResult(taskId);
      updateTaskStatus(taskId, "completed", 100, "视频处理完成", result);
      return;
    }
    
    const stage = PROCESSING_STAGES[currentStage];
    updateTaskStatus(taskId, "processing", stage.progress, stage.message);
    
    currentStage++;
    setTimeout(processNextStage, stage.time);
  }
  
  setTimeout(processNextStage, 1000);
}

// 获取任务当前状态（基于时间线）
function getTaskCurrentStatus(taskTimeline) {
  if (!taskTimeline) return null;
  
  const now = Date.now();
  const elapsedTime = now - taskTimeline.startTime;
  
  // 找到当前应该处于的时间线阶段
  let currentStatus = taskTimeline.timeline[0]; // 默认为第一个状态
  
  for (let i = 0; i < taskTimeline.timeline.length; i++) {
    const stage = taskTimeline.timeline[i];
    if (elapsedTime >= stage.timeOffset) {
      currentStatus = stage;
    } else {
      break;
    }
  }
  
  return currentStatus;
}

// 任务时间线存储（仅用于Vercel环境）
const taskTimelines = {};

// 处理结果存储（仅用于Vercel环境）
const taskResults = {};

// 设置中间件
server.use(cors())
server.use(jsonServer.bodyParser)
server.use(jsonServer.defaults())

// 视频处理API路由
server.post("/api/process-video", (req, res) => {
  const taskId = uuid.v4();
  const requestData = req.body;
  
  // 创建新任务
  const newTask = {
    id: taskId,
    status: "pending",
    progress: 0,
    message: "任务已提交，等待处理",
    requestData: requestData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  if (isVercel) {
    // Vercel环境：预计算任务时间线
    const willFail = Math.random() < 0.2;
    let failureStage = -1;
    
    if (willFail) {
      failureStage = Math.floor(Math.random() * FAILURE_SCENARIOS.length);
    }
    
    // 生成任务时间线
    taskTimelines[taskId] = calculateTaskTimeline(taskId, willFail, failureStage);
    
    // 预先生成最终结果（成功或失败）
    if (willFail) {
      taskResults[taskId] = {
        id: uuid.v4(),
        taskId: taskId,
        ...generateFailureResult(failureStage)
      };
    } else {
      taskResults[taskId] = {
        id: uuid.v4(),
        taskId: taskId,
        ...generateSuccessResult(taskId)
      };
    }
    
    // 更新内存数据库
    const db = readData();
    if (!db.tasks) db.tasks = [];
    db.tasks.push(newTask);
    writeData(db);
  } else {
    // 本地环境：正常流程
    const db = readData();
    if (!db.tasks) db.tasks = [];
    if (!db.video_results) db.video_results = [];
    
    db.tasks.push(newTask);
    writeData(db);
    
    // 异步处理
    setTimeout(() => {
      processVideo(taskId, requestData);
    }, 1000);
  }
  
  // 返回任务ID
  res.json({
    task_id: taskId,
    status: "pending",
    message: "任务已提交，等待处理"
  });
});

// 任务状态查询API
server.get("/api/task-status/:id", (req, res) => {
  const taskId = req.params.id;
  
  if (isVercel) {
    // Vercel环境：使用时间线模拟计算当前状态
    const taskTimeline = taskTimelines[taskId];
    
    if (!taskTimeline) {
      return res.status(404).json({ error: "任务不存在" });
    }
    
    const currentStatus = getTaskCurrentStatus(taskTimeline);
    
    // 检查是否完成或失败
    if (currentStatus.status === "completed" || currentStatus.status === "failed") {
      // 返回最终结果
      const result = taskResults[taskId];
      if (result) {
        return res.json(result);
      }
    }
    
    // 返回当前状态
    const db = readData();
    const task = db.tasks ? db.tasks.find(t => t.id === taskId) : null;
    
    if (!task) {
      return res.status(404).json({ error: "任务不存在" });
    }
    
    // 更新状态
    const updatedTask = {
      ...task,
      status: currentStatus.status,
      progress: currentStatus.progress,
      message: currentStatus.message,
      updatedAt: new Date().toISOString()
    };
    
    res.json(updatedTask);
  } else {
    // 本地环境：直接读取数据库
    const db = readData();
    const task = db.tasks ? db.tasks.find(t => t.id === taskId) : null;
    
    if (!task) {
      return res.status(404).json({ error: "任务不存在" });
    }
    
    // 如果任务已完成或失败并有结果ID，返回结果
    if ((task.status === "completed" || task.status === "failed") && task.resultId) {
      const result = db.video_results.find(r => r.id === task.resultId);
      if (result) {
        return res.json(result);
      }
    }
    
    // 否则返回任务状态
    res.json(task);
  }
});

// 调试API
server.get("/api/debug", (req, res) => {
  res.json({
    environment: isVercel ? "Vercel" : "Local",
    memoryDb: inMemoryDb,
    taskTimelinesCount: Object.keys(taskTimelines).length,
    taskResultsCount: Object.keys(taskResults).length,
    timestamp: new Date().toISOString()
  });
});

// 使用原始的重写规则
server.use(jsonServer.rewriter({
  '/api/*': '/$1',
  '/blog/:resource/:id/show': '/:resource/:id'
}))

server.use(router)

server.listen(3000, () => {
  console.log('JSON Server is running')
})

module.exports = server