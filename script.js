const BOARD_SIZE = 9;
const GRID_OFFSET = 20;
const GRID_SPACING = 40;

class GoGame {
    constructor() {
        this.board = []; 
        this.turn = 1; // 1: Black, 2: White
        this.captures = { 1: 0, 2: 0 };
        this.history = []; 
        this.passCount = 0;
        this.isAiEnabled = true; 
        this.handicap = 0; 
        this.gameState = 'PLAYING'; 
        this.deadStones = []; // 新增：儲存死子狀態
        
        this.uiBoard = document.getElementById('game-board');
        this.uiGrid = document.getElementById('grid-layer');
        
        this.renderGrid();
        this.init(); 

        this.uiBoard.addEventListener('click', (e) => this.handleBoardClick(e));
    }

    // --- 初始化 ---
    init() {
        this.board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
        this.captures = { 1: 0, 2: 0 };
        this.history = [];
        this.passCount = 0;
        this.gameState = 'PLAYING';
        this.deadStones = []; // 重置死子
        this.closeModal();
        
        if (this.handicap > 0) {
            this.applyHandicap();
            this.turn = 2; 
        } else {
            this.turn = 1; 
        }

        this.updateUI();
        this.updateStatus();

        if (this.turn === 2 && this.isAiEnabled) {
            setTimeout(() => this.aiMove(), 500);
        }
    }

    toggleHandicap() {
        const levels = [0, 2, 3, 4];
        let idx = levels.indexOf(this.handicap);
        this.handicap = levels[(idx + 1) % levels.length];
        document.getElementById('btn-handicap').innerText = `讓子: ${this.handicap}`;
        this.init(); 
    }

    applyHandicap() {
        const stones = {
            2: [[6,2], [2,6]],
            3: [[6,2], [2,6], [4,4]], 
            4: [[6,2], [2,6], [6,6], [2,2]]
        };
        stones[this.handicap].forEach(pos => {
            this.board[pos[1]][pos[0]] = 1; 
        });
    }

    toggleAI() {
        this.isAiEnabled = !this.isAiEnabled;
        const btn = document.getElementById('btn-ai-toggle');
        btn.innerText = `AI: ${this.isAiEnabled ? '開' : '關'}`;
        btn.className = this.isAiEnabled ? 'btn-info' : 'btn-secondary';
        
        if (this.isAiEnabled && this.turn === 2 && this.gameState === 'PLAYING') {
            this.aiMove();
        }
    }

    handleBoardClick(e) {
        if (this.gameState !== 'PLAYING') return;
        if (this.isAiEnabled && this.turn === 2) return;

        const {x, y} = this.getCoord(e);
        if (x !== null) {
            this.attemptMove(x, y);
        }
    }

    getCoord(e) {
        const rect = this.uiBoard.getBoundingClientRect();
        const xRaw = e.clientX - rect.left - GRID_OFFSET;
        const yRaw = e.clientY - rect.top - GRID_OFFSET;
        const col = Math.round(xRaw / GRID_SPACING);
        const row = Math.round(yRaw / GRID_SPACING);
        if (col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE) {
            return {x: col, y: row};
        }
        return {x: null, y: null};
    }

    attemptMove(x, y) {
        if (this.board[y][x] !== 0) return false; 

        const snapshot = {
            board: JSON.parse(JSON.stringify(this.board)),
            turn: this.turn,
            captures: {...this.captures},
            passCount: this.passCount
        };

        let tempBoard = JSON.parse(JSON.stringify(this.board));
        tempBoard[y][x] = this.turn;
        
        const opponent = this.turn === 1 ? 2 : 1;
        let capturedStones = [];

        const neighbors = this.getNeighbors(x, y);
        for (let n of neighbors) {
            if (tempBoard[n.y][n.x] === opponent) {
                const group = this.getGroup(tempBoard, n.x, n.y);
                if (this.countLiberties(tempBoard, group) === 0) {
                    capturedStones = capturedStones.concat(group);
                }
            }
        }

        capturedStones.forEach(s => tempBoard[s.y][s.x] = 0);

        const myGroup = this.getGroup(tempBoard, x, y);
        
        // --- 修改開始：加入彈出視窗警告 ---

        // 1. 自殺檢查 (Suicide)
        if (capturedStones.length === 0 && this.countLiberties(tempBoard, myGroup) === 0) {
            // 只有在人類下棋時才彈出警告，AI 嘗試時不彈出
            if (!this.isAiEnabled || this.turn === 1) {
                alert("此處為「禁著點」！\n\n原因：禁止自殺 (Suicide)\n說明：落子後該子無氣，且未能提吃對方棋子。");
            }
            return false;
        }

        // 2. 打劫檢查 (Ko) - 禁止全局同形
        const currentHash = JSON.stringify(tempBoard);
        if (this.history.length > 0) {
            const prev = this.history[this.history.length - 1];
            if (prev && JSON.stringify(prev.board) === currentHash) {
                if (!this.isAiEnabled || this.turn === 1) {
                    alert("此處為「禁著點」！\n\n原因：打劫 (Ko)\n說明：禁止全局同形，請隔一手後再提回。");
                }
                return false;
            }
        }
        
        // --- 修改結束 ---

        this.history.push(snapshot);
        this.board = tempBoard;
        this.captures[this.turn] += capturedStones.length;
        this.passCount = 0;
        this.updateUI(x, y); 

        this.switchTurn();
        return true; 
    }

    switchTurn() {
        this.turn = this.turn === 1 ? 2 : 1;
        this.updateStatus();

        if (this.isAiEnabled && this.turn === 2 && this.gameState === 'PLAYING') {
            setTimeout(() => this.aiMove(), 200);
        }
    }

    pass() {
        if (this.gameState !== 'PLAYING') return;

        this.history.push({
            board: JSON.parse(JSON.stringify(this.board)),
            turn: this.turn,
            captures: {...this.captures},
            passCount: this.passCount
        });

        this.passCount++;
        
        if (this.passCount >= 2) {
            // 雙方 Pass，觸發自動計算
            this.startAutoScoring();
        } else {
            this.switchTurn();
        }
    }

    undo() {
        if (this.gameState !== 'PLAYING' || this.history.length === 0) return;
        let steps = 1;
        if (this.isAiEnabled && this.turn === 1 && this.history.length >= 2) {
            steps = 2;
        }
        if (this.history.length === 1 && this.turn === 2 && this.isAiEnabled) {
             steps = 1;
        }

        for(let i=0; i<steps; i++) {
            if (this.history.length === 0) break;
            const prev = this.history.pop();
            this.board = prev.board;
            this.turn = prev.turn;
            this.captures = prev.captures;
            this.passCount = prev.passCount;
        }
        this.updateUI();
        this.updateStatus();
    }

    // --- AI 邏輯 ---
    // --- AI 邏輯 (升級版：貪婪演算法) ---
    aiMove() {
        if (this.gameState !== 'PLAYING') return;

        let bestScore = -Infinity;
        let bestMoves = [];

        // 遍歷棋盤上所有空格
        for(let y=0; y<BOARD_SIZE; y++){
            for(let x=0; x<BOARD_SIZE; x++){
                if(this.board[y][x] === 0) {
                    // 基礎過濾：自殺步不走、自己的真眼不填
                    if (!this.isNotSuicide(x, y, 2, this.board)) continue;
                    if (this.isTrueEye(x, y, 2, this.board)) continue; 

                    // 評估這一步的分數
                    let score = this.evaluateMove(x, y);

                    // 紀錄最高分
                    if (score > bestScore) {
                        bestScore = score;
                        bestMoves = [{x, y}];
                    } else if (score === bestScore) {
                        bestMoves.push({x, y});
                    }
                }
            }
        }

        if (bestMoves.length === 0) {
            this.pass();
            return;
        }

        // 從最高分的步數中隨機選一個 (避免每次都一模一樣)
        const move = bestMoves[Math.floor(Math.random() * bestMoves.length)];
        
        // 執行落子，如果因為打劫(Ko)失敗，則重新選其他點(這裡簡化處理直接Pass)
        if (!this.attemptMove(move.x, move.y)) {
             // 極少數情況如果最高分點是劫材被擋，簡單Pass或重算
             // 為了程式簡潔，這裡做簡單防呆：
             this.pass();
        }
    }
    evaluateMove(x, y) {
        let score = 0;
        
        // 建立虛擬盤面來模擬這一步
        let tempBoard = this.board.map(row => [...row]);
        tempBoard[y][x] = 2; // AI 是白棋(2)

        const opponent = 1;
        const myColor = 2;
        const neighbors = this.getNeighbors(x, y);
        
        // -----------------------------
        // 戰術 1: 提子 (吃掉黑棋) -> 極高分
        // -----------------------------
        let capturedCount = 0;
        for (let n of neighbors) {
            if (tempBoard[n.y][n.x] === opponent) {
                let group = this.getGroup(tempBoard, n.x, n.y);
                if (this.countLiberties(tempBoard, group) === 0) {
                    capturedCount += group.length;
                }
            }
        }
        if (capturedCount > 0) {
            score += 10000 * capturedCount; 
        }

        // -----------------------------
        // 戰術 2: 救命 (自己被叫吃，落子後氣變多) -> 高分
        // -----------------------------
        // 檢查落子前，周圍是否有自己的棋子處於叫吃狀態
        let saveBonus = 0;
        for (let n of neighbors) {
            if (this.board[n.y][n.x] === myColor) {
                let groupBefore = this.getGroup(this.board, n.x, n.y);
                let libsBefore = this.countLiberties(this.board, groupBefore);
                if (libsBefore === 1) {
                    // 落子後檢查氣是否增加
                    // 先移除剛才模擬吃掉的死子，才能準確算氣
                    // (這裡為了效能做簡化：只看落子這塊氣是否 > 1)
                    let groupAfter = this.getGroup(tempBoard, x, y);
                    let libsAfter = this.countLiberties(tempBoard, groupAfter);
                    if (libsAfter > 1) {
                        saveBonus = 5000; // 救命成功
                    }
                }
            }
        }
        score += saveBonus;

        // -----------------------------
        // 戰術 3: 叫吃對手 (讓對手剩一氣) -> 中分
        // -----------------------------
        // 如果沒吃到子，才考慮叫吃
        if (capturedCount === 0) {
            for (let n of neighbors) {
                if (tempBoard[n.y][n.x] === opponent) {
                    let group = this.getGroup(tempBoard, n.x, n.y);
                    if (this.countLiberties(tempBoard, group) === 1) {
                        score += 500; // 威脅對手
                    }
                }
            }
        }

        // -----------------------------
        // 戰術 4: 位置學 (金角銀邊)
        // -----------------------------
        // 天元 (4,4)
        if (x === 4 && y === 4) score += 50;
        
        // 星位附近 (3-3, 3-6...) 9路盤的 "第2線" (索引2,6) 是黃金線
        // 邊緣是 0 和 8，通常不好；1 和 7 是二線(爬)；2 和 6 是三線(實地)
        else if ((x === 2 || x === 6) && (y === 2 || y === 6)) score += 30; // 佔角
        else if (x >= 2 && x <= 6 && y >= 2 && y <= 6) score += 10; // 中央區域
        else if (x === 0 || x === 8 || y === 0 || y === 8) score -= 5; // 第一線(邊緣)通常不好，除非是為了吃子

        // -----------------------------
        // 戰術 5: 避免孤子，喜歡連接
        // -----------------------------
        // 如果周圍有隊友，加分
        let hasFriend = false;
        let hasEnemy = false;
        for (let n of neighbors) {
            if (this.board[n.y][n.x] === myColor) hasFriend = true;
            if (this.board[n.y][n.x] === opponent) hasEnemy = true;
        }
        if (hasFriend) score += 5; // 連接
        if (hasEnemy) score += 5;  // 貼著對手(戰鬥)

        // 加入一點點隨機性 (0~3分)，避免走法太過固定
        score += Math.random() * 3;

        return score;
    }

    // --- 自動計算核心 (Monte Carlo) ---
    async startAutoScoring() {
        this.gameState = 'SCORING';
        this.updateStatus("正在AI自動運算死活與地盤...");
        
        // 顯示 Modal，告知使用者正在計算
        const modal = document.getElementById('result-modal');
        const content = document.querySelector('.modal-content');
        
        content.innerHTML = `
            <h2 style="color:#f0a500;">AI 判決中...</h2>
            <div style="padding:20px; color:#ccc;">
                <p>正在進行模擬演算以判斷死活...</p>
                <div class="spinner" style="margin: 20px auto; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            </div>
        `;
        modal.style.display = 'flex';

        // 稍微延遲以免卡住 UI
        setTimeout(() => {
            const result = this.monteCarloScore();
            this.showFinalResult(result);
        }, 100);
    }

    // 蒙地卡羅模擬：隨機下完這盤棋 N 次，統計歸屬
    monteCarloScore() {
        const SIMULATIONS = 200; // 模擬次數，越多越準但越慢
        let territoryCounts = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0)); // >0 黑, <0 白

        for (let i = 0; i < SIMULATIONS; i++) {
            // 複製當前盤面
            let simBoard = this.board.map(row => [...row]);
            let simTurn = this.turn; // 誰先Pass沒差，輪流下
            
            // 隨機下到滿 (簡易版 Play-out)
            let passInARow = 0;
            let moves = 0;
            const MAX_MOVES = 100; // 防止無窮迴圈

            while (passInARow < 2 && moves < MAX_MOVES) {
                let moved = false;
                // 找出所有合法步
                let possibleMoves = [];
                for(let y=0; y<BOARD_SIZE; y++){
                    for(let x=0; x<BOARD_SIZE; x++){
                        if(simBoard[y][x] === 0) {
                            // 模擬時不填自己的真眼 (重要優化)
                            if (!this.isTrueEye(x, y, simTurn, simBoard)) {
                                if (this.isNotSuicide(x, y, simTurn, simBoard)) {
                                    possibleMoves.push({x, y});
                                }
                            }
                        }
                    }
                }

                if (possibleMoves.length > 0) {
                    // 隨機選一步
                    let rnd = Math.floor(Math.random() * possibleMoves.length);
                    let mv = possibleMoves[rnd];
                    // 執行落子邏輯 (簡化版，只提子不存歷史)
                    this.simulateMove(simBoard, mv.x, mv.y, simTurn);
                    passInARow = 0;
                    moved = true;
                } else {
                    passInARow++;
                }
                
                simTurn = simTurn === 1 ? 2 : 1;
                moves++;
            }

            // 統計這局模擬的結果 (Area Scoring)
            for(let y=0; y<BOARD_SIZE; y++) {
                for(let x=0; x<BOARD_SIZE; x++) {
                    if (simBoard[y][x] === 1) territoryCounts[y][x]++;
                    else if (simBoard[y][x] === 2) territoryCounts[y][x]--;
                    // 如果是空地，依據周圍判斷 (簡化：若周圍都是黑，則算黑)
                    else {
                        let owner = this.getTerritoryOwner(simBoard, x, y);
                        if (owner === 1) territoryCounts[y][x]++;
                        if (owner === 2) territoryCounts[y][x]--;
                    }
                }
            }
        }

        // 分析統計結果，決定最終盤面
        let finalBoardOwners = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
        let deadStones = []; // 用於 UI 顯示

        for(let y=0; y<BOARD_SIZE; y++) {
            for(let x=0; x<BOARD_SIZE; x++) {
                const score = territoryCounts[y][x];
                const originalStone = this.board[y][x];
                const threshold = SIMULATIONS * 0.2; // 門檻

                if (score > threshold) {
                    finalBoardOwners[y][x] = 1; // 黑地
                    if (originalStone === 2) deadStones.push({x, y}); // 原本是白子但變黑地 -> 白死子
                } else if (score < -threshold) {
                    finalBoardOwners[y][x] = 2; // 白地
                    if (originalStone === 1) deadStones.push({x, y}); // 原本是黑子但變白地 -> 黑死子
                } else {
                    // 中立/未定 (按原子算)
                    finalBoardOwners[y][x] = originalStone; 
                }
            }
        }

        return { finalBoardOwners, deadStones };
    }

    showFinalResult({ finalBoardOwners, deadStones }) {
        // 標記死子 (視覺效果)
        this.gameState = 'ENDED';
        this.deadStones = deadStones; // 存入狀態供 UI 讀取
        this.updateUI(); // 重繪，此時會將死子變半透明
        
        // 計算分數 (中國規則：子空皆地)
        let blackCount = 0;
        let whiteCount = 0;
        
        for(let y=0; y<BOARD_SIZE; y++) {
            for(let x=0; x<BOARD_SIZE; x++) {
                if (finalBoardOwners[y][x] === 1) blackCount++;
                if (finalBoardOwners[y][x] === 2) whiteCount++;
            }
        }

        const komi = this.handicap > 0 ? 0.5 : 3.75; // 7.5 目
        const finalWhite = whiteCount + komi;
        
        let winner = blackCount > finalWhite ? "黑棋勝" : "白棋勝";
        let diff = Math.abs(blackCount - finalWhite);
        
        const content = document.querySelector('.modal-content');
        content.innerHTML = `
            <h2 style="color:#f0a500; margin-bottom:10px;">對局結果 (AI判定)</h2>
            <div style="text-align:left; font-size: 0.95em; line-height:1.6;">
                <p>經由 200 次模擬運算結果：</p>
                <ul style="margin-top:0;">
                    <li>黑棋歸屬 (子+地)：<b>${blackCount}</b></li>
                    <li>白棋歸屬 (子+地+貼目)：<b>${finalWhite}</b> <span style="font-size:0.8em; color:#888">(含貼目 ${komi})</span></li>
                </ul>
                <div style="background:#333; padding:10px; border-radius:5px; margin-top:5px; text-align:center;">
                    差距：${diff} 子<br>
                    <span style="font-size:1.5em; font-weight:bold; color:#f0a500;">${winner}</span>
                </div>
                <p style="font-size:0.8em; color:#aaa; margin-top:10px;">
                    * 註：AI 判斷死活可能會有極小誤差，但通常準確。
                </p>
            </div>
            <div class="modal-buttons">
                <button class="btn-primary" onclick="game.init()">再來一局</button>
                <button class="btn-secondary" onclick="game.closeModal()">關閉</button>
            </div>
        `;
    }

    // --- 模擬落子邏輯 (極簡版，求速度) ---
    simulateMove(board, x, y, color) {
        board[y][x] = color;
        const opponent = color === 1 ? 2 : 1;
        const neighbors = this.getNeighbors(x, y);
        let captured = false;
        
        // 提對方
        for (let n of neighbors) {
            if (board[n.y][n.x] === opponent) {
                // 這裡為了速度，不使用遞迴找整塊，只看簡單氣
                // 若要精確需用 getGroup 但會慢。
                // 既然是 Play-out，我們用完整邏輯比較保險
                let group = this.getGroup(board, n.x, n.y);
                if (this.countLiberties(board, group) === 0) {
                    group.forEach(s => board[s.y][s.x] = 0);
                    captured = true;
                }
            }
        }
        
        // 自殺檢查：如果沒提對方且自己沒氣，還原 (模擬中通常不做這步，因為選點時已過濾，但為了保險)
        if (!captured) {
             let group = this.getGroup(board, x, y);
             if (this.countLiberties(board, group) === 0) {
                 board[y][x] = 0; // 還原 (非法步)
             }
        }
    }

    // 判斷是否為「真眼」 (若是真眼，AI模擬時不填，避免自己填死自己)
    isTrueEye(x, y, color, board) {
        // 上下左右必須都是自己人或邊界
        const neighbors = this.getNeighbors(x, y);
        for (let n of neighbors) {
            if (board[n.y][n.x] !== color) return false;
        }
        // 對角線檢查 (簡化：若4個對角有2個以上是敵人，則可能是假眼)
        // 9路盤此邏輯可選用，這裡為了簡單先略過
        return true; 
    }

    isNotSuicide(x, y, color, board) {
        // 預先檢查：落下後是否有氣，或能提子
        // 為了效能，這裡只檢查「是否有鄰居是空的」或「鄰居是敵人且氣少」
        // 這是一個近似解
        const neighbors = this.getNeighbors(x, y);
        let hasLiberty = false;
        let captures = false;
        
        // 模擬落子
        board[y][x] = color;
        for(let n of neighbors) {
            if (board[n.y][n.x] === 0) hasLiberty = true;
            else if (board[n.y][n.x] !== color) {
                // 檢查能否提吃敵人
                let g = this.getGroup(board, n.x, n.y);
                if (this.countLiberties(board, g) === 0) captures = true;
            }
        }
        
        let selfAlive = false;
        if (!hasLiberty && !captures) {
            let g = this.getGroup(board, x, y);
            if (this.countLiberties(board, g) > 0) selfAlive = true;
        } else {
            selfAlive = true;
        }
        
        board[y][x] = 0; // 還原
        return selfAlive;
    }

    // --- 共用輔助函式 (與原本相同) ---
    getNeighbors(x, y) {
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        let res = [];
        dirs.forEach(d => {
            const nx = x + d[0], ny = y + d[1];
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) res.push({x: nx, y: ny});
        });
        return res;
    }

    getGroup(board, x, y) {
        const color = board[y][x];
        let group = [];
        let visited = new Set([`${x},${y}`]);
        let queue = [{x, y}];
        while (queue.length > 0) {
            const curr = queue.shift();
            group.push(curr);
            let neighbors = this.getNeighbors(curr.x, curr.y);
            for (let n of neighbors) {
                if (board[n.y][n.x] === color && !visited.has(`${n.x},${n.y}`)) {
                    visited.add(`${n.x},${n.y}`);
                    queue.push(n);
                }
            }
        }
        return group;
    }

    countLiberties(board, group) {
        let liberties = new Set();
        group.forEach(stone => {
            let neighbors = this.getNeighbors(stone.x, stone.y);
            for(let n of neighbors) {
                if (board[n.y][n.x] === 0) liberties.add(`${n.x},${n.y}`);
            }
        });
        return liberties.size;
    }

    getTerritoryOwner(board, startX, startY) {
        let queue = [{x: startX, y: startY}];
        let visited = new Set([`${startX},${startY}`]);
        let touchBlack = false;
        let touchWhite = false;

        while(queue.length > 0) {
            let curr = queue.shift();
            let neighbors = this.getNeighbors(curr.x, curr.y);
            
            for (let n of neighbors) {
                let val = board[n.y][n.x];
                if (val === 1) touchBlack = true;
                else if (val === 2) touchWhite = true;
                else if (!visited.has(`${n.x},${n.y}`)) {
                    visited.add(`${n.x},${n.y}`);
                    queue.push(n);
                }
            }
        }
        if (touchBlack && !touchWhite) return 1;
        if (!touchBlack && touchWhite) return 2;
        return 0; 
    }

    renderGrid() {
        this.uiGrid.innerHTML = '';
        for (let i = 0; i < BOARD_SIZE; i++) {
            let h = document.createElement('div'); h.className = 'line-horz'; h.style.top = (i*GRID_SPACING)+'px';
            this.uiGrid.appendChild(h);
            let v = document.createElement('div'); v.className = 'line-vert'; v.style.left = (i*GRID_SPACING)+'px';
            this.uiGrid.appendChild(v);
        }
        const stars = [[2,2], [2,6], [6,2], [6,6], [4,4]];
        stars.forEach(pos => {
            let s = document.createElement('div'); s.className = 'star-point';
            s.style.left = (GRID_OFFSET+pos[0]*GRID_SPACING)+'px';
            s.style.top = (GRID_OFFSET+pos[1]*GRID_SPACING)+'px';
            this.uiBoard.appendChild(s);
        });
    }

    // --- UI 更新 (大幅優化版) ---
    updateUI(lastX = -1, lastY = -1) {
        const uiStones = document.querySelectorAll('.stone');
        const existingStones = {}; // 紀錄畫面上已有的子: "x,y" -> DOM Element

        // 1. 標記目前畫面上所有的子
        uiStones.forEach(s => {
            // 如果正在跑提子動畫的就跳過
            if(s.classList.contains('captured-anim')) return;
            const left = parseInt(s.style.left);
            const top = parseInt(s.style.top);
            // 反推座標
            const x = Math.round((left - GRID_OFFSET) / GRID_SPACING);
            const y = Math.round((top - GRID_OFFSET) / GRID_SPACING);
            existingStones[`${x},${y}`] = s;
        });

        // 2. 掃描新的棋盤資料
        for(let y=0; y<BOARD_SIZE; y++) {
            for(let x=0; x<BOARD_SIZE; x++) {
                const color = this.board[y][x];
                const key = `${x},${y}`;
                
                if (color !== 0) {
                    // A. 如果這個位置應該有子
                    if (existingStones[key]) {
                        // 畫面上已經有子 -> 更新樣式 (例如最後一手標記)
                        const s = existingStones[key];
                        // 確保顏色正確 (防呆)
                        s.className = `stone ${color === 1 ? 'black' : 'white'}`;
                        if (x === lastX && y === lastY) s.classList.add('last-move');
                        // 死子顯示
                        if (this.gameState === 'ENDED' && this.deadStones && this.deadStones.some(d => d.x === x && d.y === y)) {
                            s.classList.add('dead');
                        }
                        // 從清單移除，表示這個子是「活著」的
                        delete existingStones[key];
                    } else {
                        // 畫面上沒子 -> 新增一顆 (落子)
                        this.createStone(x, y, color, (x === lastX && y === lastY));
                    }
                }
            }
        }

        // 3. 處理「被吃掉」的子
        // 此時 existingStones 剩下的，就是「資料變成0」但「畫面還有」的子 -> 即被提子
        for (let key in existingStones) {
            const stone = existingStones[key];
            stone.classList.add('captured-anim'); // 觸發 CSS 動畫
            // 動畫結束後從 DOM 移除
            setTimeout(() => {
                if(stone && stone.parentNode) stone.remove();
            }, 250); // 配合 CSS 的 0.2s
        }

        // 4. 更新狀態列文字
        document.getElementById('capture-black').innerText = this.captures[1];
        document.getElementById('capture-white').innerText = this.captures[2];
        
        // 5. 執行進階 UI 檢查 (叫吃警告)
        if (this.gameState === 'PLAYING') {
            this.checkAtariAndHighlight();
        }
    }

    // 輔助：建立棋子 DOM
    createStone(x, y, color, isLast) {
        let s = document.createElement('div');
        s.className = `stone ${color === 1 ? 'black' : 'white'}`;
        if (isLast) s.classList.add('last-move');
        
        s.style.left = (GRID_OFFSET + x * GRID_SPACING) + 'px';
        s.style.top = (GRID_OFFSET + y * GRID_SPACING) + 'px';
        
        // 加入滑鼠事件 (為了同色顯示功能)
        s.addEventListener('mouseenter', () => this.highlightGroup(x, y));
        s.addEventListener('mouseleave', () => this.clearHighlightGroup());

        this.uiBoard.appendChild(s);
    }

    updateStatus(msg) {
        if (msg) {
            document.getElementById('current-player-text').innerText = msg;
            return;
        }
        const text = this.turn === 1 ? '黑棋' : '白棋';
        const type = (this.isAiEnabled && this.turn === 2) ? '(AI 思考中)' : '';
        document.getElementById('current-player-text').innerText = `${text} ${type}`;
        document.getElementById('current-player-dot').className = `dot ${this.turn===1?'black':'white'}`;
    }

    closeModal() {
        document.getElementById('result-modal').style.display = 'none';
        this.gameState = 'PLAYING';
    }

    // --- 新增：UI 輔助功能 ---

    // 功能 A: 叫吃警告 (掃描全盤，剩一氣的顯示紅點)
    checkAtariAndHighlight() {
        // 先移除舊的警告
        document.querySelectorAll('.stone.atari').forEach(s => s.classList.remove('atari'));

        for(let y=0; y<BOARD_SIZE; y++) {
            for(let x=0; x<BOARD_SIZE; x++) {
                if (this.board[y][x] !== 0) {
                    let group = this.getGroup(this.board, x, y);
                    let libs = this.countLiberties(this.board, group);
                    
                    if (libs === 1) {
                        // 找到這顆子的 DOM
                        const domStone = this.findStoneElement(x, y);
                        if (domStone) domStone.classList.add('atari');
                    }
                }
            }
        }
    }

    // 功能 B: 滑鼠滑過高亮整塊棋
    highlightGroup(x, y) {
        if (this.gameState !== 'PLAYING') return;
        const group = this.getGroup(this.board, x, y);
        group.forEach(coord => {
            const el = this.findStoneElement(coord.x, coord.y);
            if (el) el.classList.add('group-highlight');
        });
    }

    clearHighlightGroup() {
        document.querySelectorAll('.stone.group-highlight').forEach(s => {
            s.classList.remove('group-highlight');
        });
    }

    // 輔助：根據座標找 DOM
    findStoneElement(x, y) {
        const targetLeft = (GRID_OFFSET + x * GRID_SPACING) + 'px';
        const targetTop = (GRID_OFFSET + y * GRID_SPACING) + 'px';
        
        const stones = document.querySelectorAll('.stone');
        for (let s of stones) {
            if (s.style.left === targetLeft && s.style.top === targetTop && !s.classList.contains('captured-anim')) {
                return s;
            }
        }
        return null;
    }
}

const game = new GoGame();