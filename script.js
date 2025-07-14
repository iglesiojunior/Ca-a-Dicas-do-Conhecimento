// Estado do jogo
let gameState = {
    started: false,
    score: 0,
    hintsUsed: 0,
    wins: 0,
    gameStartTime: null,
    timerInterval: null,
    totalGames: 0,
    totalScore: 0,
    bestTime: null,
    consecutiveWrongGuesses: 0,
    totalPossibilities: "0"
};

// Elementos do DOM
const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const categoryDisplay = document.getElementById('category-display');
const scoreElement = document.getElementById('score');
const hintsElement = document.getElementById('hints-used');
const timerElement = document.getElementById('timer');
const winsElement = document.getElementById('wins');
const hintBtn = document.getElementById('hint-btn');
const sendBtn = document.getElementById('send-btn');

// Função para buscar estatísticas do jogo
async function fetchGameStatistics() {
    try {
        const response = await fetch('http://127.0.0.1:5000/get_statistics', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        
        if (response.ok) {
            gameState.totalPossibilities = data.statistics.formatted_total;
            console.log('📊 Estatísticas do jogo:', data.statistics);
            return data;
        }
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
    }
    return null;
}

// Funções do jogo
async function startNewGame() {
    try {
        showLoading();
        const response = await fetch('http://127.0.0.1:5000/start_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await response.json();
        
        if (response.ok) {
            gameState.started = true;
            gameState.hintsUsed = 0;
            gameState.gameStartTime = Date.now();
            gameState.totalGames++;
            gameState.consecutiveWrongGuesses = 0;
            
            // Atualiza o total de possibilidades se fornecido
            if (data.total_possibilities) {
                gameState.totalPossibilities = data.total_possibilities;
            }
            
            // Exibe categoria e subcategoria
            const categoryText = data.sub_category ? 
                `${data.category} - ${data.sub_category}` : 
                data.category;
            categoryDisplay.textContent = `🎯 Categoria: ${categoryText}`;
            
            // Adiciona mensagem inicial com informações sobre possibilidades
            const initialMessage = `${data.message}\n\n📊 Este jogo possui ${gameState.totalPossibilities} possibilidades teóricas!`;
            addMessage('chatbot', initialMessage, 'normal');
            
            enableInput();
            startTimer();
            showHintButton();
            
            updateDisplay();
        } else {
            addMessage('chatbot', data.message || 'Erro ao iniciar o jogo', 'error');
        }
    } catch (error) {
        console.error('Erro ao iniciar jogo:', error);
        addMessage('chatbot', 'Erro ao conectar com o servidor', 'error');
    } finally {
        hideLoading();
    }
}

async function sendMessage(customMessage = null) {
    const message = customMessage || userInput.value.trim();
    if (!message || !gameState.started) return;

    addMessage('user', message, 'user');
    userInput.value = '';

    try {
        showLoading();
        const response = await fetch('http://127.0.0.1:5000/send_message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message })
        });
        const data = await response.json();
        
        if (response.ok) {
            if (data.status === 'correct') {
                handleCorrectAnswer(data);
            } else if (data.status === 'hint') {
                handleHint(data);
            } else {
                handleWrongGuess(data);
            }
        } else {
            addMessage('chatbot', data.message || 'Erro ao processar mensagem', 'error');
        }
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        addMessage('chatbot', 'Erro ao conectar com o servidor', 'error');
    } finally {
        hideLoading();
    }
}

function handleCorrectAnswer(data) {
    const gameTime = Math.floor((Date.now() - gameState.gameStartTime) / 1000);
    const timeBonus = Math.max(0, 300 - gameTime) * 10; // Bônus por tempo
    const hintPenalty = gameState.hintsUsed * 50; // Penalidade por dicas
    const baseScore = 1000;
    const finalScore = Math.max(0, baseScore + timeBonus - hintPenalty);
    
    gameState.score += finalScore;
    gameState.wins++;
    gameState.totalScore += finalScore;
    gameState.consecutiveWrongGuesses = 0;
    
    if (!gameState.bestTime || gameTime < gameState.bestTime) {
        gameState.bestTime = gameTime;
    }
    
    // Verifica se foi acerto exato ou similar
    const isExactMatch = data.exact_match !== false; // Assume true se não especificado
    const similarity = data.similarity || 1.0;
    
    let successMessage = data.message;
    
    // Adiciona informações extras se não for acerto exato
    if (!isExactMatch && similarity < 1.0) {
        successMessage += `\n\n🎯 Similaridade: ${Math.round(similarity * 100)}%`;
    }
    
    successMessage += `\n\n⏱️ Tempo: ${gameTime}s\n` +
                     `💡 Dicas usadas: ${gameState.hintsUsed}\n` +
                     `🏆 Pontos ganhos: ${finalScore}`;
    
    addMessage('chatbot', successMessage, 'correct');
    showConfetti();
    endGame();
}

function handleHint(data) {
    gameState.hintsUsed++;
    addMessage('chatbot', data.message, 'hint');
    updateDisplay();
}

function handleWrongGuess(data) {
    gameState.consecutiveWrongGuesses++;
    
    // Adiciona a mensagem de erro com feedback de similaridade
    let message = data.message;
    if (data.similarity !== undefined) {
        const similarityPercent = Math.round(data.similarity * 100);
        message += `\n\n🎯 Similaridade com a resposta: ${similarityPercent}%`;
    }
    
    addMessage('chatbot', message, 'normal');
    
    // Se o usuário errou 1 vez, dá uma dica automática menor
    if (gameState.consecutiveWrongGuesses >= 1) {
        setTimeout(() => {
            generateSmallHint();
        }, 1500); // Aumentei o tempo para dar mais destaque
    }
}

async function generateSmallHint() {
    try {
        const response = await fetch('http://127.0.0.1:5000/generate_small_hint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await response.json();
        
        if (response.ok && data.small_hint) {
            // Adiciona uma dica automática mais destacada
            addMessage('chatbot', `💡 **Dica automática:** ${data.small_hint}`, 'auto-hint');
        }
    } catch (error) {
        console.error('Erro ao gerar dica automática:', error);
    }
}

function requestHint() {
    sendMessage('dica');
}

function endGame() {
    gameState.started = false;
    stopTimer();
    disableInput();
    hideHintButton();
    updateDisplay();
    saveStats();
}

// Funções de interface
function addMessage(role, text, type = 'normal') {
    const div = document.createElement('div');
    div.className = `message message-${role}`;
    
    if (type === 'correct') {
        div.classList.add('message-correct');
    } else if (type === 'hint') {
        div.classList.add('message-hint');
    } else if (type === 'small-hint') {
        div.classList.add('message-small-hint');
    } else if (type === 'auto-hint') {
        div.classList.add('message-auto-hint');
    }
    
    div.textContent = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function enableInput() {
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.placeholder = "Digite seu palpite ou peça uma dica...";
    userInput.focus();
}

function disableInput() {
    userInput.disabled = true;
    sendBtn.disabled = true;
    userInput.placeholder = "Clique em 'Novo Jogo' para jogar novamente";
}

function showHintButton() {
    hintBtn.style.display = 'flex';
}

function hideHintButton() {
    hintBtn.style.display = 'none';
}

function startTimer() {
    gameState.timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }
}

function updateTimer() {
    if (gameState.gameStartTime) {
        const elapsed = Math.floor((Date.now() - gameState.gameStartTime) / 1000);
        timerElement.textContent = `${elapsed}s`;
    }
}

function updateDisplay() {
    scoreElement.textContent = gameState.score;
    hintsElement.textContent = gameState.hintsUsed;
    winsElement.textContent = gameState.wins;
}

function showLoading() {
    sendBtn.innerHTML = '<span class="loading"></span>';
    sendBtn.disabled = true;
}

function hideLoading() {
    sendBtn.innerHTML = 'Enviar';
    sendBtn.disabled = false;
}

function showConfetti() {
    // Simulação simples de confete
    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.style.position = 'fixed';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.top = '-10px';
            confetti.style.width = '10px';
            confetti.style.height = '10px';
            confetti.style.background = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'][Math.floor(Math.random() * 5)];
            confetti.style.borderRadius = '50%';
            confetti.style.pointerEvents = 'none';
            confetti.style.zIndex = '1000';
            confetti.style.animation = 'fall 3s linear forwards';
            document.body.appendChild(confetti);
            
            setTimeout(() => confetti.remove(), 3000);
        }, i * 50);
    }
}

// Funções de modal
function showRules() {
    document.getElementById('rules-modal').style.display = 'flex';
}

function hideRules() {
    document.getElementById('rules-modal').style.display = 'none';
}

function showStats() {
    const statsModal = document.getElementById('stats-modal');
    const statsContent = document.getElementById('stats-content');
    loadStats();
    fetchGameStatistics().then(data => {
        if (data) {
            const possibilitiesHtml = `
                <div class="possibilities-section">
                    <h3>🎯 Possibilidades do Jogo</h3>
                    <p><strong>Total de possibilidades:</strong> ${data.statistics.formatted_total}</p>
                    <div class="breakdown">
                        <p>📚 ${data.breakdown.categorias}</p>
                        <p>🏷️ ${data.breakdown.subcategorias}</p>
                        <p>📝 ${data.breakdown.exemplos_fixos}</p>
                        <p>🤖 ${data.breakdown.geracao_dinamica}</p>
                        <p>📊 ${data.breakdown.niveis_dificuldade}</p>
                        <p>💡 ${data.breakdown.variacoes_dicas}</p>
                    </div>
                </div>
            `;
            statsContent.innerHTML = `
                <div class="personal-stats">
                    <h3>📈 Suas Estatísticas</h3>
                    <p>Jogos jogados: <span id="games-played">${gameState.totalGames}</span></p>
                    <p>Taxa de acerto: <span id="win-rate">${gameState.totalGames > 0 ? Math.round((gameState.wins / gameState.totalGames) * 100) : 0}%</span></p>
                    <p>Melhor tempo: <span id="best-time">${gameState.bestTime ? gameState.bestTime + 's' : '-'}</span></p>
                    <p>Pontuação total: <span id="total-score">${gameState.totalScore}</span></p>
                </div>
                ${possibilitiesHtml}
            `;
        } else {
            statsContent.innerHTML = `
                <div class="personal-stats">
                    <h3>📈 Suas Estatísticas</h3>
                    <p>Jogos jogados: <span id="games-played">${gameState.totalGames}</span></p>
                    <p>Taxa de acerto: <span id="win-rate">${gameState.totalGames > 0 ? Math.round((gameState.wins / gameState.totalGames) * 100) : 0}%</span></p>
                    <p>Melhor tempo: <span id="best-time">${gameState.bestTime ? gameState.bestTime + 's' : '-'}</span></p>
                    <p>Pontuação total: <span id="total-score">${gameState.totalScore}</span></p>
                </div>
                <div class="possibilities-section">
                    <h3>🎯 Possibilidades do Jogo</h3>
                    <p><strong>Total de possibilidades:</strong> ${gameState.totalPossibilities}</p>
                    <p><em>Carregando estatísticas detalhadas...</em></p>
                </div>
            `;
        }
    });
    statsModal.classList.add('active');
}

function hideStats() {
    document.getElementById('stats-modal').classList.remove('active');
}

// Funções de persistência
function saveStats() {
    localStorage.setItem('gameStats', JSON.stringify({
        totalGames: gameState.totalGames,
        wins: gameState.wins,
        totalScore: gameState.totalScore,
        bestTime: gameState.bestTime
    }));
}

function loadStats() {
    const stats = localStorage.getItem('gameStats');
    if (stats) {
        const parsed = JSON.parse(stats);
        gameState.totalGames = parsed.totalGames || 0;
        gameState.wins = parsed.wins || 0;
        gameState.totalScore = parsed.totalScore || 0;
        gameState.bestTime = parsed.bestTime || null;
    }
}

// Event handlers
function handleKeyPress(event) {
    if (event.key === 'Enter' && !userInput.disabled) {
        sendMessage();
    }
}

// Fechar modais clicando fora
window.onclick = function(event) {
    if (event.target.classList.contains('rules-modal')) {
        hideRules();
    }
    if (event.target.classList.contains('stats-modal')) {
        hideStats();
    }
}

// Inicialização da página
document.addEventListener('DOMContentLoaded', function() {
    loadStats();
    fetchGameStatistics(); // Busca estatísticas do servidor ao carregar
    updateDisplay();
}); 