// See https://github.com/typicode/json-server#module
const jsonServer = require('json-server')
const server = jsonServer.create()
const fs = require('fs')
const path = require('path')
const uuid = require('uuid')
const cors = require('cors')

// Important: Use different approaches for local vs Vercel
const isVercel = process.env.VERCEL === '1';
let router;

if (isVercel) {
  // In Vercel: Use embedded data approach
  const data = require('../db.json');
  router = jsonServer.router(data);
} else {
  // Local: Use file-based approach
  const filePath = path.join('db.json');
  router = jsonServer.router(filePath);
}

// Define processing stages (shortened for Vercel)
const PROCESSING_STAGES = [
  { progress: 30, message: "正在处理视频资源", time: 500 },
  { progress: 70, message: "正在生成视频版本", time: 500 },
  { progress: 100, message: "视频处理完成", time: 0 }
];

// Define failure scenarios
const FAILURE_SCENARIOS = [
  { stage: 0, message: "视频资源处理失败" },
  { stage: 1, message: "视频封面生成失败，素材分辨率过低" }
];

// Helper function for Vercel - simulates db operations using in-memory data
const inMemoryDb = {
  tasks: [],
  video_results: []
};

// Read data function (works in both environments)
function readData() {
  if (isVercel) {
    return JSON.parse(JSON.stringify(inMemoryDb));
  } else {
    const content = fs.readFileSync(path.join('db.json'), "utf8");
    return JSON.parse(content);
  }
}

// Write data function (works in both environments)
function writeData(data) {
  if (isVercel) {
    // In Vercel, update in-memory data
    inMemoryDb.tasks = data.tasks || [];
    inMemoryDb.video_results = data.video_results || [];
  } else {
    // Local, write to file
    fs.writeFileSync(path.join('db.json'), JSON.stringify(data, null, 2), "utf8");
  }
}

// Update task status
function updateTaskStatus(taskId, status, progress, message, result = null) {
  const db = readData();
  
  // Initialize arrays if needed
  if (!db.tasks) db.tasks = [];
  if (!db.video_results) db.video_results = [];
  
  // Find and update task
  const taskIndex = db.tasks.findIndex(task => task.id === taskId);
  if (taskIndex === -1) return;
  
  db.tasks[taskIndex] = {
    ...db.tasks[taskIndex],
    status,
    progress,
    message,
    updatedAt: new Date().toISOString()
  };
  
  // Add result if needed
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

// Simplified video processing for Vercel
function processVideo(taskId, requestData) {
  // For Vercel, we'll handle this as a simulated immediate response
  // Instead of real async processing with multiple stages
  
  // Decide if task will fail (20% chance)
  const willFail = Math.random() < 0.2;
  
  if (willFail) {
    // Create failure result
    const randomFailure = FAILURE_SCENARIOS[Math.floor(Math.random() * FAILURE_SCENARIOS.length)];
    const failureResult = {
      success: false,
      data: null,
      message: randomFailure.message,
      error_code: 503
    };
    
    updateTaskStatus(taskId, "failed", 70, randomFailure.message, failureResult);
  } else {
    // Create success result
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
  }
}

// Setup middleware
server.use(cors())
server.use(jsonServer.bodyParser)
server.use(jsonServer.defaults())

// Custom routes
server.post("/api/process-video", (req, res) => {
  const taskId = uuid.v4();
  const requestData = req.body;
  
  // Create new task
  const db = readData();
  if (!db.tasks) db.tasks = [];
  if (!db.video_results) db.video_results = [];
  
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
  writeData(db);
  
  // In Vercel, process immediately instead of with setTimeout
  if (isVercel) {
    processVideo(taskId, requestData);
  } else {
    // Locally, use setTimeout for simulation
    setTimeout(() => {
      processVideo(taskId, requestData);
    }, 1000);
  }
  
  // Return task ID
  res.json({
    task_id: taskId,
    status: "pending",
    message: "任务已提交，等待处理"
  });
});

// Task status endpoint
server.get("/api/task-status/:id", (req, res) => {
  const taskId = req.params.id;
  const db = readData();
  
  // Find task
  const task = db.tasks ? db.tasks.find(t => t.id === taskId) : null;
  
  if (!task) {
    return res.status(404).json({ error: "任务不存在" });
  }
  
  // Return result if available
  if ((task.status === "completed" || task.status === "failed") && task.resultId) {
    const result = db.video_results.find(r => r.id === task.resultId);
    if (result) {
      return res.json(result);
    }
  }
  
  // Otherwise return task status
  res.json(task);
});

// Add debugging route
server.get("/api/debug", (req, res) => {
  res.json({
    environment: isVercel ? "Vercel" : "Local",
    memoryData: inMemoryDb,
    timestamp: new Date().toISOString()
  });
});

// Standard JSON Server routes
server.use(jsonServer.rewriter({
  '/api/*': '/$1',
  '/blog/:resource/:id/show': '/:resource/:id'
}))

server.use(router)

server.listen(3000, () => {
  console.log('JSON Server is running')
})

module.exports = server