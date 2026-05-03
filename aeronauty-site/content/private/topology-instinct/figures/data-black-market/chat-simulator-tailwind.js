/**
 * Chat Conversation Simulator - Tailwind CSS Version
 * Uses Tailwind CSS classes for professional styling
 */

class ChatSimulator {
    constructor(container, config = {}) {
        this.container = typeof container === 'string' 
            ? document.querySelector(container) 
            : container;
        
        this.config = {
            theme: 'teams',
            loop: true,
            loopDelay: 1000,
            participants: [],
            messages: [],
            ...config
        };
        
        this.state = {
            isPlaying: false,
            isPaused: false,
            currentIndex: 0,
            timeouts: [],
        };
        
        this.elements = {};
        this.onComplete = null;
        this.onMessageShow = null;
        
        this.init();
    }
    
    init() {
        this.container.innerHTML = '';
        this.buildUI();
    }
    
    buildUI() {
        const theme = this.config.theme;
        
        if (theme === 'teams') {
            this.buildTeamsUI();
        } else if (theme === 'slack') {
            this.buildSlackUI();
        } else if (theme === 'email') {
            this.buildEmailUI();
        }
    }
    
    buildTeamsUI() {
        this.container.className = 'flex flex-col h-full bg-white rounded-xl overflow-hidden shadow-lg';
        
        // Teams purple header - minimal
        this.container.innerHTML = `
            <div class="flex-shrink-0 bg-gradient-to-r from-[#5B5FC7] to-[#6264A7] px-2 py-1 flex items-center gap-1.5">
                <div class="w-5 h-5 bg-white/20 rounded flex items-center justify-center">
                    <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                </div>
                <span class="text-white font-semibold text-xs">Engineering</span>
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto p-3 pb-6 bg-white" id="messages-area"></div>
            <div class="flex-shrink-0 px-3 py-1 border-t border-gray-200 bg-white" id="typing-area"></div>
        `;
        
        this.elements.messageContainer = this.container.querySelector('#messages-area');
        this.elements.typingArea = this.container.querySelector('#typing-area');
    }
    
    buildSlackUI() {
        this.container.className = 'flex h-full rounded-xl overflow-hidden shadow-lg';
        
        this.container.innerHTML = `
            <div class="w-48 bg-[#4A154B] flex flex-col flex-shrink-0">
                <div class="p-3 border-b border-white/10">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 bg-gradient-to-br from-[#36C5F0] via-[#2EB67D] to-[#E01E5A] rounded-lg flex items-center justify-center text-white font-bold text-xs">EA</div>
                        <div class="text-white font-bold text-sm">EngAero</div>
                    </div>
                </div>
                <div class="py-2">
                    <div class="flex items-center gap-2 px-3 py-1 bg-[#1164A3] text-white">
                        <span class="text-sm opacity-80">#</span>
                        <span class="text-xs">cfd-team</span>
                        <span class="ml-auto bg-[#E01E5A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">3</span>
                    </div>
                </div>
            </div>
            <div class="flex-1 flex flex-col bg-white min-w-0">
                <div class="px-4 py-2 border-b border-gray-200 flex-shrink-0">
                    <div class="flex items-center gap-1">
                        <span class="text-gray-500">#</span>
                        <span class="font-black text-gray-900">cfd-team</span>
                    </div>
                </div>
                <div class="overflow-y-auto px-4 py-3 pb-8" id="messages-area" style="height: 280px; max-height: 280px;"></div>
                <div class="px-4 py-2 flex-shrink-0" id="typing-area"></div>
            </div>
        `;
        
        this.elements.messageContainer = this.container.querySelector('#messages-area');
        this.elements.typingArea = this.container.querySelector('#typing-area');
    }
    
    buildEmailUI() {
        this.container.className = 'flex flex-col h-full bg-[#F3F2F1] rounded-xl overflow-hidden shadow-lg';
        
        this.container.innerHTML = `
            <div class="flex-shrink-0 bg-white border-b border-gray-200">
                <div class="flex gap-0.5 px-2 py-0.5 border-b border-gray-100 bg-gray-50 text-[10px]">
                    <span class="flex items-center gap-0.5 px-1.5 text-gray-600">
                        <svg class="w-2.5 h-2.5 text-[#0078D4]" fill="currentColor" viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
                        Reply
                    </span>
                    <span class="flex items-center gap-0.5 px-1.5 text-gray-600">
                        <svg class="w-2.5 h-2.5 text-[#0078D4]" fill="currentColor" viewBox="0 0 24 24"><path d="M7 8V5l-7 7 7 7v-3l-4-4 4-4zm6 1V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
                        Reply All
                    </span>
                    <span class="flex items-center gap-0.5 px-1.5 text-gray-600">
                        <svg class="w-2.5 h-2.5 text-[#0078D4]" fill="currentColor" viewBox="0 0 24 24"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg>
                        Forward
                    </span>
                </div>
                <div class="px-2 py-1">
                    <h1 class="text-xs font-semibold text-gray-800">RE: CFD Mesh Review - URGENT</h1>
                </div>
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto p-3 pb-6" id="messages-area"></div>
            <div class="flex-shrink-0 p-1" id="typing-area"></div>
        `;
        
        this.elements.messageContainer = this.container.querySelector('#messages-area');
        this.elements.typingArea = this.container.querySelector('#typing-area');
    }
    
    getParticipant(id) {
        return this.config.participants.find(p => p.id === id) || {
            id: id,
            name: id,
            avatar: id.substring(0, 2).toUpperCase()
        };
    }
    
    getAvatarColor(id) {
        const colors = [
            'bg-purple-600', 'bg-red-500', 'bg-teal-500', 'bg-indigo-500',
            'bg-pink-500', 'bg-cyan-600', 'bg-orange-500', 'bg-gray-600',
            'bg-green-500', 'bg-blue-500'
        ];
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    }
    
    createMessageElement(message) {
        const participant = this.getParticipant(message.from);
        const theme = this.config.theme;
        const avatarColor = this.getAvatarColor(message.from);
        const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        
        const el = document.createElement('div');
        el.className = 'message-enter';
        
        if (theme === 'teams' || theme === 'slack') {
            const isSlack = theme === 'slack';
            el.innerHTML = `
                <div class="flex items-start gap-3 ${isSlack ? 'hover:bg-gray-50 -mx-2 px-2 py-1 rounded' : 'py-2'}">
                    <div class="w-9 h-9 ${avatarColor} ${isSlack ? 'rounded-md' : 'rounded-full'} flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                        ${participant.avatar}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-baseline gap-2">
                            <span class="${isSlack ? 'font-black' : 'font-semibold'} text-sm text-gray-900">${participant.name}</span>
                            <span class="text-xs text-gray-500">${time}</span>
                        </div>
                        <p class="text-sm text-gray-800 mt-0.5">${this.formatMessageText(message.text)}</p>
                    </div>
                </div>
            `;
        } else if (theme === 'email') {
            const dateStr = new Date().toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
            });
            el.innerHTML = `
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 mb-3">
                    <div class="flex items-start gap-3 p-4 border-b border-gray-100">
                        <div class="w-11 h-11 ${avatarColor} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
                            ${participant.avatar}
                        </div>
                        <div>
                            <div class="font-semibold text-gray-900">${participant.name}</div>
                            <div class="text-sm text-gray-500">${dateStr}</div>
                        </div>
                    </div>
                    <div class="p-4 text-sm text-gray-800 leading-relaxed">
                        ${this.formatMessageText(message.text)}
                    </div>
                </div>
            `;
        }
        
        return el;
    }
    
    formatMessageText(text) {
        if (!text) return '';
        return text
            .replace(/@channel/g, '<span class="bg-yellow-100 text-yellow-800 px-1 rounded font-medium">@channel</span>')
            .replace(/@(\w+)/g, '<span class="bg-yellow-100 text-yellow-800 px-1 rounded font-medium">@$1</span>');
    }
    
    showTypingIndicator(participantId) {
        const participant = this.getParticipant(participantId);
        const theme = this.config.theme;
        
        this.elements.typingArea.innerHTML = '';
        
        const indicator = document.createElement('div');
        indicator.className = 'flex items-center gap-2 text-sm text-gray-500 opacity-0 transition-opacity duration-200';
        
        if (theme === 'teams' || theme === 'slack') {
            indicator.innerHTML = `
                <span class="font-semibold text-gray-700">${participant.name}</span>
                <span>is typing</span>
                <span class="flex gap-1">
                    <span class="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></span>
                    <span class="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></span>
                    <span class="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></span>
                </span>
            `;
        } else if (theme === 'email') {
            indicator.innerHTML = `
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3 flex items-center gap-3">
                    <span class="w-2.5 h-2.5 bg-[#0078D4] rounded-full animate-pulse"></span>
                    <span class="italic">${participant.name} is composing a reply...</span>
                </div>
            `;
        }
        
        this.elements.typingArea.appendChild(indicator);
        
        requestAnimationFrame(() => {
            indicator.style.opacity = '1';
        });
    }
    
    hideTypingIndicator() {
        const indicator = this.elements.typingArea.firstChild;
        if (indicator) {
            indicator.style.opacity = '0';
            setTimeout(() => {
                if (this.elements.typingArea.contains(indicator)) {
                    this.elements.typingArea.removeChild(indicator);
                }
            }, 200);
        }
    }
    
    showMessage(message) {
        const el = this.createMessageElement(message);
        this.elements.messageContainer.appendChild(el);
        
        requestAnimationFrame(() => {
            el.classList.remove('message-enter');
            el.classList.add('message-visible');
        });
        
        // Scroll to bottom within container only (not page)
        const container = this.elements.messageContainer;
        const scrollToBottom = () => {
            // Only use scrollTop - avoid scrollIntoView which scrolls the page
            container.scrollTop = container.scrollHeight;
        };
        
        // Call a few times to ensure it works after rendering
        scrollToBottom();
        requestAnimationFrame(scrollToBottom);
        setTimeout(scrollToBottom, 50);
        setTimeout(scrollToBottom, 200);
        
        if (this.onMessageShow) {
            this.onMessageShow(message, this.state.currentIndex);
        }
    }
    
    clearMessages() {
        if (this.elements.messageContainer) {
            this.elements.messageContainer.innerHTML = '';
        }
        this.hideTypingIndicator();
    }
    
    clearTimeouts() {
        this.state.timeouts.forEach(t => clearTimeout(t));
        this.state.timeouts = [];
    }
    
    async play() {
        if (this.state.isPlaying && !this.state.isPaused) return;
        
        if (this.state.isPaused) {
            this.state.isPaused = false;
            this.processNextMessage();
            return;
        }
        
        this.state.isPlaying = true;
        this.state.isPaused = false;
        this.state.currentIndex = 0;
        
        this.clearMessages();
        this.processNextMessage();
    }
    
    pause() {
        if (!this.state.isPlaying) return;
        this.state.isPaused = true;
        this.clearTimeouts();
    }
    
    stop() {
        this.state.isPlaying = false;
        this.state.isPaused = false;
        this.state.currentIndex = 0;
        this.clearTimeouts();
        this.clearMessages();
    }
    
    reset() {
        this.stop();
    }
    
    processNextMessage() {
        if (!this.state.isPlaying || this.state.isPaused) return;
        
        const messages = this.config.messages;
        
        if (this.state.currentIndex >= messages.length) {
            this.hideTypingIndicator();
            
            if (this.config.loop) {
                const timeout = setTimeout(() => {
                    this.state.currentIndex = 0;
                    this.clearMessages();
                    this.processNextMessage();
                }, this.config.loopDelay);
                this.state.timeouts.push(timeout);
            } else {
                this.state.isPlaying = false;
                if (this.onComplete) {
                    this.onComplete();
                }
            }
            return;
        }
        
        const message = messages[this.state.currentIndex];
        const delay = message.delay || 500;
        const typing = message.typing || {};
        const typingDuration = typing.duration || 0;
        const cancelTyping = typing.cancel || false;
        
        if (typingDuration > 0) {
            const typingTimeout = setTimeout(() => {
                if (!this.state.isPlaying || this.state.isPaused) return;
                this.showTypingIndicator(message.from);
                
                const messageTimeout = setTimeout(() => {
                    if (!this.state.isPlaying || this.state.isPaused) return;
                    this.hideTypingIndicator();
                    
                    if (!cancelTyping && message.text) {
                        const showTimeout = setTimeout(() => {
                            if (!this.state.isPlaying || this.state.isPaused) return;
                            this.showMessage(message);
                            this.state.currentIndex++;
                            this.processNextMessage();
                        }, 100);
                        this.state.timeouts.push(showTimeout);
                    } else {
                        this.state.currentIndex++;
                        this.processNextMessage();
                    }
                }, typingDuration);
                this.state.timeouts.push(messageTimeout);
            }, delay);
            this.state.timeouts.push(typingTimeout);
        } else {
            const timeout = setTimeout(() => {
                if (!this.state.isPlaying || this.state.isPaused) return;
                if (message.text) {
                    this.showMessage(message);
                }
                this.state.currentIndex++;
                this.processNextMessage();
            }, delay);
            this.state.timeouts.push(timeout);
        }
    }
    
    setConfig(config) {
        this.config = { ...this.config, ...config };
        this.stop();
        this.init();
    }
    
    setTheme(theme) {
        this.config.theme = theme;
        this.stop();
        this.init();
    }
    
    getTotalDuration() {
        let total = 0;
        for (const msg of this.config.messages) {
            total += msg.delay || 500;
            if (msg.typing) {
                total += msg.typing.duration || 0;
            }
            total += 100;
        }
        return total;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatSimulator;
}
