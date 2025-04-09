// See https://github.com/typicode/json-server#module
const jsonServer = require('json-server')
const server = jsonServer.create()
const fs = require('fs')
const path = require('path')
const uuid = require('uuid')
const cors = require('cors')

// Enable file write operations
const filePath = path.join('db.json')
const router = jsonServer.router(filePath)

// 处理延迟阶段定义
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

// 读取db.json内容
function readDb() {
  const content = fs.readFileSync(filePath, "utf8");
  return JSON.parse(content);
}

// 写入db.json内容
function writeDb(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// 更新任务状态
function updateTaskStatus(taskId, status, progress, message, result = null) {
  const db = readDb();
  
  // 初始化tasks数组（如果不存在）
  if (!db.tasks) {
    db.tasks = [];
  }
  
  // 初始化video_results数组（如果不存在）
  if (!db.video_results) {
    db.video_results = [];
  }
  
  // 查找任务
  const taskIndex = db.tasks.findIndex(task => task.id === taskId);
  if (taskIndex === -1) return;
  
  // 更新任务
  db.tasks[taskIndex] = {
    ...db.tasks[taskIndex],
    status,
    progress,
    message,
    updatedAt: new Date().toISOString()
  };
  
  // 如果处理完成或失败，添加结果到video_results并关联到任务
  if ((status === "completed" || status === "failed") && result) {
    const resultId = uuid.v4();
    db.video_results.push({
      id: resultId,
      taskId: taskId,
      ...result
    });
    db.tasks[taskIndex].resultId = resultId;
  }
  
  writeDb(db);
}

// 模拟视频处理过程
function processVideo(taskId, requestData) {
  // 设置初始状态为处理中
  updateTaskStatus(taskId, "processing", 0, "开始处理视频");
  
  // 模拟处理各个阶段
  let currentStage = 0;
  
  // 决定这个任务是否会失败 (20%的失败率)
  const willFail = Math.random() < 0.2;
  
  // 如果要失败，随机选择一个失败的阶段
  let failureStage = -1;
  let failureMessage = "";
  
  if (willFail) {
    const randomFailure = FAILURE_SCENARIOS[Math.floor(Math.random() * FAILURE_SCENARIOS.length)];
    failureStage = randomFailure.stage;
    failureMessage = randomFailure.message;
  }
  
  function processNextStage() {
    // 检查是否应该在当前阶段失败
    if (currentStage === failureStage) {
      // 创建失败结果
      const failureResult = {
        success: false,
        data: null,
        message: failureMessage,
        error_code: 500 + currentStage // 简单的错误代码生成
      };
      
      updateTaskStatus(taskId, "failed", PROCESSING_STAGES[currentStage].progress, failureMessage, failureResult);
      return;
    }
    
    if (currentStage >= PROCESSING_STAGES.length) {
      // 所有阶段完成，生成结果
      const result = {
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
      
      updateTaskStatus(taskId, "completed", 100, "视频处理完成", result);
      return;
    }
    
    const stage = PROCESSING_STAGES[currentStage];
    updateTaskStatus(taskId, "processing", stage.progress, stage.message);
    
    currentStage++;
    setTimeout(processNextStage, stage.time);
  }
  
  // 开始处理第一个阶段
  setTimeout(processNextStage, 1000);
}

const middlewares = jsonServer.defaults()

// Use CORS and body parser
server.use(cors())
server.use(jsonServer.bodyParser)
server.use(middlewares)

// Add custom routes before router
server.post("/api/process-video", (req, res) => {
  const taskId = uuid.v4();
  const requestData = req.body;
  
  // 创建新任务
  const db = readDb();
  
  // 确保tasks数组存在
  if (!db.tasks) {
    db.tasks = [];
  }
  
  // 确保video_results数组存在
  if (!db.video_results) {
    db.video_results = [];
  }
  
  const newTask = {
    id: taskId,
    status: "pending",
    progress: 0,
    message: "任务已提交，等待处理",
    requestData: requestData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  db.tasks.push(newTask);
  writeDb(db);
  
  // 模拟异步处理
  setTimeout(() => {
    processVideo(taskId, requestData);
  }, 1000);
  
  // 返回任务ID
  res.json({
    task_id: taskId,
    status: "pending",
    message: "任务已提交，等待处理"
  });
});

// 查询任务状态的路由
server.get("/api/task-status/:id", (req, res) => {
  const taskId = req.params.id;
  const db = readDb();
  
  // 查找任务
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
});

// Use original rewriter
server.use(jsonServer.rewriter({
  '/api/*': '/$1',
  '/blog/:resource/:id/show': '/:resource/:id'
}))

// Use router after custom routes
server.use(router)

server.listen(3000, () => {
  console.log('JSON Server is running')
})

// Export the Server API
module.exports = server