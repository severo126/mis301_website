// Hand-Tracking "Catch Falling Objects" Game
// Uses MediaPipe Hand Landmarker for real-time hand detection

import { HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js';

// Game state
let handLandmarker = null;
let webcamRunning = false;
let gameRunning = false;
let score = 0;
let lives = 3;
let fallingObjects = [];
let handPosition = null;
let lastSpawnTime = 0;
const SPAWN_INTERVAL = 1500; // ms between spawns
const CATCH_RADIUS = 60;

// DOM elements
const video = document.getElementById('webcam');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const playAgainBtn = document.getElementById('playAgainBtn');
const scoreDisplay = document.getElementById('scoreDisplay');
const livesDisplay = document.getElementById('livesDisplay');
const gameOverlay = document.getElementById('gameOverlay');
const finalScoreSpan = document.getElementById('finalScore');

// Falling object class
class FallingObject {
  constructor() {
    this.x = Math.random() * (canvas.width - 60) + 30;
    this.y = -30;
    this.speed = 2 + Math.random() * 2; // 2-4 pixels per frame
    this.radius = 25;

    // Random type with weighted probability
    const rand = Math.random();
    if (rand < 0.15) {
      // Star - rare, high points
      this.emoji = '⭐';
      this.points = 10;
    } else if (rand < 0.45) {
      // Coin - medium
      this.emoji = '🪙';
      this.points = 5;
    } else {
      // Fruit - common
      const fruits = ['🍎', '🍊', '🍋', '🍇', '🍓'];
      this.emoji = fruits[Math.floor(Math.random() * fruits.length)];
      this.points = 3;
    }
  }

  update() {
    this.y += this.speed;
  }

  draw() {
    ctx.font = '40px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.emoji, this.x, this.y);
  }

  isOffScreen() {
    return this.y > canvas.height + 30;
  }

  collidesWith(px, py) {
    const dx = this.x - px;
    const dy = this.y - py;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < CATCH_RADIUS;
  }
}

// Initialize MediaPipe Hand Landmarker
async function initHandLandmarker() {
  startBtn.textContent = 'Loading...';
  startBtn.disabled = true;

  try {
    console.log('Loading hand landmarker model...');
    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
    );

    handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 1
    });

    console.log('Hand landmarker loaded successfully!');
    startBtn.textContent = 'Start Game';
    startBtn.disabled = false;
  } catch (error) {
    console.error('Error loading hand landmarker:', error);
    startBtn.textContent = 'Error Loading';
  }
}

// Start webcam
async function startWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 }
    });
    video.srcObject = stream;
    await video.play();
    webcamRunning = true;
    return true;
  } catch (error) {
    console.error('Error accessing webcam:', error);
    alert('Could not access webcam. Please allow camera permissions.');
    return false;
  }
}

// Start game
async function startGame() {
  console.log('Starting game...');
  console.log('Hand landmarker loaded:', handLandmarker !== null);

  if (!webcamRunning) {
    console.log('Requesting webcam access...');
    const success = await startWebcam();
    if (!success) return;
    console.log('Webcam access granted');
  }

  // Reset game state
  score = 0;
  lives = 3;
  fallingObjects = [];
  lastSpawnTime = 0;
  handPosition = null;

  updateHUD();
  gameOverlay.style.display = 'none';
  startBtn.style.display = 'none';
  restartBtn.style.display = 'inline-block';

  gameRunning = true;
  requestAnimationFrame(gameLoop);
}

// Game loop
function gameLoop(timestamp) {
  if (!gameRunning) return;

  // Detect hands
  if (handLandmarker && webcamRunning) {
    const results = handLandmarker.detectForVideo(video, timestamp);

    if (results.landmarks && results.landmarks.length > 0) {
      // Use landmark 9 (middle finger base) as palm position
      const landmark = results.landmarks[0][9];
      // Mirror X coordinate for natural interaction
      handPosition = {
        x: (1 - landmark.x) * canvas.width,
        y: landmark.y * canvas.height
      };
    } else {
      handPosition = null;
    }
  }

  // Spawn new objects
  if (timestamp - lastSpawnTime > SPAWN_INTERVAL) {
    fallingObjects.push(new FallingObject());
    lastSpawnTime = timestamp;
  }

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw semi-transparent webcam feed
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.scale(-1, 1);
  ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
  ctx.restore();

  // Update and draw falling objects
  for (let i = fallingObjects.length - 1; i >= 0; i--) {
    const obj = fallingObjects[i];
    obj.update();
    obj.draw();

    // Check collision with hand
    if (handPosition && obj.collidesWith(handPosition.x, handPosition.y)) {
      score += obj.points;
      fallingObjects.splice(i, 1);
      updateHUD();
      continue;
    }

    // Check if object fell off screen
    if (obj.isOffScreen()) {
      lives--;
      fallingObjects.splice(i, 1);
      updateHUD();

      if (lives <= 0) {
        endGame();
        return;
      }
    }
  }

  // Draw hand indicator
  if (handPosition) {
    ctx.font = '50px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🖐️', handPosition.x, handPosition.y);

    // Draw catch radius circle
    ctx.beginPath();
    ctx.arc(handPosition.x, handPosition.y, CATCH_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(20, 33, 61, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  requestAnimationFrame(gameLoop);
}

// Update HUD display
function updateHUD() {
  scoreDisplay.textContent = `Score: ${score}`;
  livesDisplay.textContent = `Lives: ${lives}`;
}

// End game
function endGame() {
  gameRunning = false;
  finalScoreSpan.textContent = score;
  gameOverlay.style.display = 'flex';
  restartBtn.style.display = 'none';
  startBtn.style.display = 'inline-block';
}

// Event listeners
startBtn.addEventListener('click', () => {
  console.log('Start button clicked');
  startGame();
});
restartBtn.addEventListener('click', () => {
  console.log('Restart button clicked');
  startGame();
});
playAgainBtn.addEventListener('click', () => {
  console.log('Play again button clicked');
  gameOverlay.style.display = 'none';
  startGame();
});

// Initialize - ES modules are deferred so DOM is ready
console.log('Initializing hand landmarker...');
initHandLandmarker();
