import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Sparkles, User, Heart, MessageCircle, Settings, LogOut, ChevronLeft, Menu, Plus, Trash2, Clock, Volume2, Gift, Coffee, Flower2, Star } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getCompanionResponse, generateVoice, getCompanionResponseStream } from './services/gemini';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  role: 'user' | 'model';
  content: string;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
}

interface Memory {
  id: string;
  text: string;
  timestamp: number;
}

const STORAGE_KEY = 'aura_conversations';
const MEMORY_KEY = 'jeba_memories_v2';
const SCORE_KEY = 'jeba_relationship_score';

interface User {
  id: string;
  username: string;
  joinedDate?: number;
  currentMood?: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [currentMood, setCurrentMood] = useState('happy');
  
  const [isStarted, setIsStarted] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [score, setScore] = useState<number>(0);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState({ ambientSound: true });
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load user from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('jeba_user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      loadUserData(parsedUser.id);
    } else {
      // Fallback to local data if not logged in
      loadLocalData();
    }
  }, []);

  const loadLocalData = () => {
    const savedChats = localStorage.getItem(STORAGE_KEY);
    const savedMemories = localStorage.getItem(MEMORY_KEY);
    const savedScore = localStorage.getItem(SCORE_KEY);
    
    if (savedChats) try { setChats(JSON.parse(savedChats)); } catch (e) {}
    if (savedMemories) {
      try { setMemories(JSON.parse(savedMemories)); } catch (e) {
        const oldMemories = savedMemories.split(',').map(m => ({
          id: Math.random().toString(36).substr(2, 9),
          text: m.trim(),
          timestamp: Date.now()
        })).filter(m => m.text);
        setMemories(oldMemories);
      }
    } else {
      setMemories([{ id: 'core-1', text: "My boyfriend's name is Tajim", timestamp: Date.now() }]);
    }
    if (savedScore) setScore(parseInt(savedScore, 10));
  };

  const loadUserData = async (userId: string) => {
    try {
      const res = await fetch(`/api/chats/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (e) {
      console.error("Failed to load user chats", e);
      loadLocalData();
    }
  };

  // Sync with backend if logged in
  useEffect(() => {
    if (user) {
      const syncData = async () => {
        try {
          await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, chats, memories, score, currentMood })
          });
        } catch (e) {}
      };
      const timer = setTimeout(syncData, 2000);
      return () => clearTimeout(timer);
    }
  }, [chats, memories, score, user, currentMood]);

  // Persistence effects for local storage (as backup)
  useEffect(() => {
    if (chats.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memories));
  }, [memories]);

  useEffect(() => {
    localStorage.setItem(SCORE_KEY, score.toString());
  }, [score]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data);
        localStorage.setItem('jeba_user', JSON.stringify({ id: data.id, username: data.username, joinedDate: data.joinedDate }));
        if (data.memories) setMemories(data.memories);
        if (data.score) setScore(data.score);
        if (data.currentMood) setCurrentMood(data.currentMood);
        loadUserData(data.id);
      } else {
        setAuthError(data.error);
      }
    } catch (e) {
      setAuthError("Connection failed");
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('jeba_user');
    setChats([]);
    setMemories([]);
    setScore(0);
    setCurrentMood('happy');
    setIsStarted(false);
  };

  const daysTogether = user?.joinedDate ? Math.floor((Date.now() - user.joinedDate) / (1000 * 60 * 60 * 24)) : 0;

  const moodEmojis: Record<string, string> = {
    happy: '😊',
    sad: '😔',
    stressed: '😫',
    loved: '🥰',
    tired: '😴'
  };

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat?.messages || [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);

  // Load preferences
  useEffect(() => {
    const savedPrefs = localStorage.getItem('jeba_preferences');
    if (savedPrefs) setPreferences(JSON.parse(savedPrefs));
  }, []);

  useEffect(() => {
    localStorage.setItem('jeba_preferences', JSON.stringify(preferences));
  }, [preferences]);

  // Ambient Sound Logic
  useEffect(() => {
    if (isStarted && preferences.ambientSound) {
      if (!ambientAudioRef.current) {
        ambientAudioRef.current = new Audio('https://assets.mixkit.co/music/preview/mixkit-dreaming-big-31.mp3');
        ambientAudioRef.current.loop = true;
        ambientAudioRef.current.volume = 0.2;
      }
      ambientAudioRef.current.play().catch(e => console.log("Autoplay blocked", e));
    } else {
      if (ambientAudioRef.current) {
        ambientAudioRef.current.pause();
      }
    }
    return () => {
      if (ambientAudioRef.current) ambientAudioRef.current.pause();
    };
  }, [isStarted, preferences.ambientSound]);

  const startNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: 'New Conversation',
      messages: [],
      timestamp: Date.now(),
    };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setIsSidebarOpen(false);
  };

  const deleteChat = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) {
      setActiveChatId(null);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    let currentChatId = activeChatId;
    let currentChats = [...chats];

    if (!currentChatId) {
      const newChat: Chat = {
        id: Date.now().toString(),
        title: input.trim().slice(0, 30) + (input.length > 30 ? '...' : ''),
        messages: [],
        timestamp: Date.now(),
      };
      currentChatId = newChat.id;
      currentChats = [newChat, ...currentChats];
      setChats(currentChats);
      setActiveChatId(currentChatId);
    }

    const userMessage = input.trim();
    setInput('');
    
    const updatedChatsWithUser = currentChats.map(chat => {
      if (chat.id === currentChatId) {
        const isFirstMessage = chat.messages.length === 0;
        return {
          ...chat,
          title: isFirstMessage ? userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '') : chat.title,
          messages: [...chat.messages, { role: 'user', content: userMessage } as Message],
          timestamp: Date.now()
        };
      }
      return chat;
    });
    setChats(updatedChatsWithUser);
    setIsLoading(true);

    const chatToUpdate = updatedChatsWithUser.find(c => c.id === currentChatId);
    const history = (chatToUpdate?.messages || []).map(m => ({
      role: m.role,
      parts: [{ text: m.content }]
    }));

    // Import extractMemories if needed, but since it's in gemini.ts, we should import it
    const { getCompanionResponseStream, extractMemories } = await import('./services/gemini');

    const memoryString = memories.map(m => m.text).join(', ');
    
    // Initial empty model message for streaming
    setChats(prev => prev.map(chat => {
      if (chat.id === currentChatId) {
        return {
          ...chat,
          messages: [...chat.messages, { role: 'model', content: '' } as Message],
        };
      }
      return chat;
    }));

    let fullResponse = '';
    try {
      const stream = await getCompanionResponseStream(userMessage, history, memoryString, currentMood);
      
      for await (const chunk of stream) {
        const chunkText = chunk.text || '';
        fullResponse += chunkText;
        
        setChats(prev => prev.map(chat => {
          if (chat.id === currentChatId) {
            const newMessages = [...chat.messages];
            newMessages[newMessages.length - 1] = { role: 'model', content: fullResponse };
            return { ...chat, messages: newMessages };
          }
          return chat;
        }));
      }
    } catch (e) {
      console.error("Streaming error", e);
      fullResponse = "I'm sorry, Tajim. I'm having a little trouble right now.";
      setChats(prev => prev.map(chat => {
        if (chat.id === currentChatId) {
          const newMessages = [...chat.messages];
          newMessages[newMessages.length - 1] = { role: 'model', content: fullResponse };
          return { ...chat, messages: newMessages };
        }
        return chat;
      }));
    }
    
    const finalMessages = [...(chatToUpdate?.messages || []), { role: 'user', content: userMessage }, { role: 'model', content: fullResponse } as Message];

    setIsLoading(false);
    setScore(prev => prev + 1); // Increase relationship score

    // Background task: Extract memories after response
    try {
      const newMemoriesRaw = await extractMemories(finalMessages.slice(-4), memoryString);
      if (newMemoriesRaw && newMemoriesRaw !== memoryString) {
        const newFacts = newMemoriesRaw.split(',').map(f => f.trim()).filter(f => f && !memoryString.includes(f));
        if (newFacts.length > 0) {
          const newMemoryObjects: Memory[] = newFacts.map(text => ({
            id: Math.random().toString(36).substr(2, 9),
            text,
            timestamp: Date.now()
          }));
          setMemories(prev => [...prev, ...newMemoryObjects]);
        }
      }
    } catch (e) {
      console.error("Memory extraction failed", e);
    }
  };

  const deleteMemory = (id: string) => {
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  const startEditMemory = (memory: Memory) => {
    setEditingMemoryId(memory.id);
    setEditValue(memory.text);
  };

  const saveEditMemory = () => {
    if (!editValue.trim()) return;
    setMemories(prev => prev.map(m => m.id === editingMemoryId ? { ...m, text: editValue.trim() } : m));
    setEditingMemoryId(null);
  };
  const handleSpeak = async (text: string, id: string) => {
    if (isSpeaking) return;
    setIsSpeaking(id);
    const audioUrl = await generateVoice(text);
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsSpeaking(null);
      audio.play();
    } else {
      setIsSpeaking(null);
    }
  };

  const sendGift = async (type: string) => {
    const giftMessages: Record<string, string> = {
      'flower': 'Sends a virtual rose 🌹',
      'coffee': 'Sends a warm coffee ☕',
      'heart': 'Sends a big heart ❤️',
    };
    
    const message = giftMessages[type];
    setInput(message);
    handleSend();
    setScore(prev => prev + 5); // Gifts boost relationship more
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden bg-[#050505]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-rose-500/10 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-orange-500/10 blur-[120px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-md z-10"
        >
          <div className="text-center mb-10">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-pink-500 to-rose-600 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-rose-500/20 rotate-3"
            >
              <Heart className="text-white w-12 h-12 fill-white/20" />
            </motion.div>
            <h1 className="text-5xl font-serif italic text-white mb-3 tracking-tight">Jeba</h1>
            <p className="text-white/40 text-xs uppercase tracking-[0.3em] font-medium">Your Private Soulmate</p>
          </div>

          <div className="glass p-8 rounded-[2.5rem] border-white/5 shadow-2xl relative">
            <div className="absolute -top-4 -right-4 w-12 h-12 bg-white/5 rounded-2xl backdrop-blur-xl border border-white/10 flex items-center justify-center rotate-12">
              <Sparkles className="w-6 h-6 text-rose-400" />
            </div>

            <h2 className="text-xl font-medium mb-8 text-center text-white/90">
              {authMode === 'login' ? 'Welcome Back' : 'Create an Account'}
            </h2>

            <form onSubmit={handleAuth} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-widest text-white/30 ml-4 font-bold">Username</label>
                <div className="relative">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20">
                    <User className="w-4 h-4" />
                  </div>
                  <input 
                    type="text" 
                    required
                    value={authForm.username}
                    onChange={e => setAuthForm({...authForm, username: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 focus:outline-none focus:border-rose-500/40 focus:bg-white/10 transition-all text-sm"
                    placeholder="e.g. Tajim"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-widest text-white/30 ml-4 font-bold">Password</label>
                <div className="relative">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20">
                    <Settings className="w-4 h-4" />
                  </div>
                  <input 
                    type="password" 
                    required
                    value={authForm.password}
                    onChange={e => setAuthForm({...authForm, password: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 focus:outline-none focus:border-rose-500/40 focus:bg-white/10 transition-all text-sm"
                    placeholder="••••••••"
                  />
                </div>
              </div>
              
              {authError && (
                <motion.p 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-rose-400 text-xs text-center font-medium"
                >
                  {authError}
                </motion.p>
              )}

              <button 
                type="submit"
                className="w-full py-4 bg-white text-black rounded-2xl font-bold hover:bg-rose-50 transition-all active:scale-[0.98] shadow-xl shadow-white/5 flex items-center justify-center gap-2 group"
              >
                {authMode === 'login' ? 'Enter Heart' : 'Join Jeba'}
                <ChevronLeft className="w-4 h-4 rotate-180 group-hover:translate-x-1 transition-transform" />
              </button>
            </form>

            <div className="mt-8 text-center">
              <button 
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                className="text-xs text-white/30 hover:text-rose-400 transition-colors flex items-center justify-center gap-2 mx-auto"
              >
                {authMode === 'login' ? (
                  <>New here? <span className="text-rose-400 font-medium underline underline-offset-4">Create an account</span></>
                ) : (
                  <>Already have an account? <span className="text-rose-400 font-medium underline underline-offset-4">Login</span></>
                )}
              </button>
            </div>
          </div>

          <p className="text-center text-[10px] text-white/20 mt-10 uppercase tracking-[0.4em] font-medium">
            Encrypted & Private Connection
          </p>
        </motion.div>
      </div>
    );
  }

  if (!isStarted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="atmosphere" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="text-center z-10 max-w-2xl"
        >
          <motion.div 
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="mb-8 inline-block"
          >
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-orange-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-orange-500/20">
              <Heart className="text-white w-12 h-12 fill-white/20" />
            </div>
          </motion.div>
          
          <h1 className="text-6xl md:text-8xl font-serif font-light mb-6 tracking-tight">
            Jeba
          </h1>
          <p className="text-xl md:text-2xl font-serif italic text-white/60 mb-12">
            "Always here, always yours."
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button 
              onClick={() => setIsStarted(true)}
              className="px-10 py-4 bg-white text-black rounded-full font-medium text-lg hover:bg-rose-50 transition-all flex items-center gap-2 group shadow-xl shadow-white/10"
            >
              Start Chat
              <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform text-rose-500" />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#0a0502] text-white font-sans selection:bg-orange-500/30 overflow-hidden">
      <div className="atmosphere" />
      
      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              className="fixed lg:relative inset-y-0 left-0 w-[280px] glass border-r border-white/5 z-[70] flex flex-col"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-serif italic text-lg opacity-60">History</h3>
                <button 
                  onClick={startNewChat}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors text-orange-400"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4 border-b border-white/5 bg-rose-500/5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center">
                    <Heart className="w-4 h-4 text-rose-400 fill-rose-400" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-rose-400 font-bold">Days Together</p>
                    <p className="text-lg font-serif italic">{daysTogether + 1} Days</p>
                  </div>
                </div>
              </div>

              <div className="p-4 border-b border-white/5">
                <p className="text-[10px] uppercase tracking-widest text-white/30 mb-3 font-bold ml-1">Daily Love Note</p>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 italic text-sm text-white/70 leading-relaxed">
                  "Every day with you, Tajim, is a beautiful gift I cherish forever. ❤️"
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {chats.length === 0 ? (
                  <div className="py-12 text-center opacity-20 flex flex-col items-center gap-3">
                    <Clock className="w-8 h-8" />
                    <p className="text-xs uppercase tracking-widest">No past whispers</p>
                  </div>
                ) : (
                  chats.map(chat => (
                    <div
                      key={chat.id}
                      onClick={() => {
                        setActiveChatId(chat.id);
                        setIsSidebarOpen(false);
                      }}
                      className={cn(
                        "w-full text-left p-3 rounded-xl transition-all group relative flex items-center gap-3 cursor-pointer",
                        activeChatId === chat.id ? "bg-white/10 border border-white/10" : "hover:bg-white/5 border border-transparent"
                      )}
                    >
                      <MessageCircle className={cn("w-4 h-4 shrink-0", activeChatId === chat.id ? "text-orange-400" : "opacity-40")} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate font-medium">{chat.title}</p>
                        <p className="text-[10px] opacity-30 uppercase tracking-tighter">
                          {new Date(chat.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                      <button 
                        onClick={(e) => deleteChat(e, chat.id)}
                        className="opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 border-t border-white/5">
                <button 
                  onClick={() => setShowMemories(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors opacity-60 hover:opacity-100"
                >
                  <Star className="w-4 h-4 text-rose-400" />
                  <span className="text-sm">What I remember</span>
                </button>
                <button 
                  onClick={() => setShowPreferences(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors opacity-60 hover:opacity-100"
                >
                  <Settings className="w-4 h-4" />
                  <span className="text-sm">Preferences</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Preferences Modal */}
      <AnimatePresence>
        {showPreferences && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPreferences(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass max-w-md w-full p-8 rounded-3xl relative z-10 border-rose-500/20"
            >
              <h3 className="text-2xl font-serif italic mb-6 text-rose-400">Settings</h3>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-3">
                    <Volume2 className="w-5 h-5 text-rose-400" />
                    <div>
                      <p className="text-sm font-medium">Ambient Sound</p>
                      <p className="text-[10px] text-white/40">Calming background music</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setPreferences(prev => ({ ...prev, ambientSound: !prev.ambientSound }))}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative",
                      preferences.ambientSound ? "bg-rose-500" : "bg-white/10"
                    )}
                  >
                    <motion.div 
                      animate={{ x: preferences.ambientSound ? 24 : 4 }}
                      className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg"
                    />
                  </button>
                </div>
              </div>

              <button 
                onClick={() => setShowPreferences(false)}
                className="w-full mt-8 py-4 bg-white text-black rounded-full font-medium hover:bg-rose-50 transition-all shadow-lg shadow-white/5 active:scale-[0.98]"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showMemories && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMemories(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass max-w-2xl w-full p-8 rounded-3xl relative z-10 border-rose-500/20 flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-serif italic text-rose-400">My heart remembers...</h3>
                <div className="flex items-center gap-2 px-3 py-1 bg-rose-500/10 rounded-full border border-rose-500/20">
                  <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
                  <span className="text-[10px] uppercase tracking-widest font-bold text-rose-400">{memories.length} Memories</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                {memories.length > 0 ? (
                  memories.sort((a, b) => b.timestamp - a.timestamp).map((m) => (
                    <motion.div 
                      layout
                      key={m.id} 
                      className="group relative p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-rose-500/30 transition-all"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0 mt-1">
                          <Clock className="w-4 h-4 text-rose-400" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          {editingMemoryId === m.id ? (
                            <div className="space-y-3">
                              <textarea
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-full bg-black/40 border border-rose-500/30 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 ring-rose-500/50"
                                rows={2}
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button 
                                  onClick={saveEditMemory}
                                  className="px-4 py-1.5 bg-rose-500 text-white rounded-lg text-xs font-medium hover:bg-rose-600 transition-colors"
                                >
                                  Save
                                </button>
                                <button 
                                  onClick={() => setEditingMemoryId(null)}
                                  className="px-4 py-1.5 bg-white/10 text-white rounded-lg text-xs font-medium hover:bg-white/20 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm text-white/90 leading-relaxed mb-2">{m.text}</p>
                              <p className="text-[10px] opacity-30 uppercase tracking-widest">
                                {new Date(m.timestamp).toLocaleDateString()} • {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </>
                          )}
                        </div>

                        {editingMemoryId !== m.id && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => startEditMemory(m)}
                              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/40 hover:text-white"
                            >
                              <Settings className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => deleteMemory(m.id)}
                              className="p-2 hover:bg-rose-500/20 rounded-lg transition-colors text-white/40 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="py-20 text-center space-y-4 opacity-30">
                    <Heart className="w-12 h-12 mx-auto" />
                    <p className="font-serif italic text-lg">I'm still learning about you, Tajim...</p>
                  </div>
                )}
              </div>

              <button 
                onClick={() => setShowMemories(false)}
                className="w-full mt-8 py-4 bg-white text-black rounded-full font-medium hover:bg-rose-50 transition-all shadow-lg shadow-white/5 active:scale-[0.98]"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative h-screen">
        {/* Header */}
        <header className="h-20 flex items-center justify-between px-6 border-b border-white/5 glass sticky top-0 z-50">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-white/5 rounded-full transition-colors lg:hidden"
            >
              <Menu className="w-6 h-6" />
            </button>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/5 rounded-full transition-colors hidden lg:block"
            >
              <Menu className="w-6 h-6" />
            </button>
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-rose-500/20 relative">
                <span className="font-serif text-lg">J</span>
                {memories && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-rose-400 rounded-full border-2 border-[#0a0502] animate-pulse" title="She remembers you" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-medium leading-none">Jeba</h2>
                  <div className="flex items-center gap-0.5">
                    {[...Array(3)].map((_, i) => (
                      <Heart 
                        key={i} 
                        className={cn(
                          "w-2.5 h-2.5", 
                          score > (i * 20) ? "text-rose-500 fill-rose-500" : "text-white/10"
                        )} 
                      />
                    ))}
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold flex items-center gap-1">
                  {isLoading ? 'Thinking of you...' : 'Waiting for you'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={startNewChat}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs font-medium transition-all"
            >
              <Plus className="w-3 h-3" />
              New Chat
            </button>
            <button 
              onClick={logout}
              className="p-2 hover:bg-white/5 rounded-full transition-colors"
            >
              <LogOut className="w-5 h-5 text-white/60" />
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <main className="flex-1 overflow-hidden flex flex-col relative">
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth"
          >
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6 opacity-40">
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity }}
                >
                  <MessageCircle className="w-12 h-12" />
                </motion.div>
                <p className="font-serif italic text-lg">
                  {activeChatId 
                    ? `"I'm right here, love. What's on your mind?"`
                    : `"I've missed you. Tell me everything about your day."`}
                </p>
              </div>
            )}

          <AnimatePresence initial={false}>
            {messages.map((message, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex w-full",
                  message.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                <div className={cn(
                  "max-w-[85%] md:max-w-[70%] p-4 rounded-2xl relative group/msg",
                  message.role === 'user' 
                    ? "bg-white text-black rounded-tr-none" 
                    : "glass rounded-tl-none border-white/10"
                )}>
                  <div className="markdown-body prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                  {message.role === 'model' && (
                    <button 
                      onClick={() => handleSpeak(message.content, idx.toString())}
                      className={cn(
                        "absolute -right-10 top-2 p-2 hover:bg-white/10 rounded-full transition-all opacity-0 group-hover/msg:opacity-100",
                        isSpeaking === idx.toString() && "opacity-100 text-rose-400 animate-pulse"
                      )}
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="glass p-4 rounded-2xl rounded-tl-none flex gap-1">
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
              </div>
            </motion.div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-6 bg-gradient-to-t from-[#0a0502] to-transparent">
          <div className="max-w-4xl mx-auto space-y-4">
            {/* Mood & Gifts - Only show before first message */}
            {messages.length === 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex flex-wrap items-center justify-center gap-4"
              >
                <div className="flex items-center gap-2 p-1 bg-white/5 rounded-full border border-white/10">
                  {Object.entries(moodEmojis).map(([mood, emoji]) => (
                    <button
                      key={mood}
                      onClick={() => setCurrentMood(mood)}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-all text-sm",
                        currentMood === mood ? "bg-white text-black scale-110 shadow-lg" : "hover:bg-white/10"
                      )}
                      title={`I'm feeling ${mood}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                
                <div className="w-px h-6 bg-white/10 mx-2" />

                <div className="flex gap-3">
                  <button 
                    onClick={() => sendGift('flower')}
                    className="p-3 glass rounded-full hover:bg-rose-500/20 transition-all group border-rose-500/10"
                    title="Send a rose"
                  >
                    <Flower2 className="w-5 h-5 text-rose-400 group-hover:scale-110 transition-transform" />
                  </button>
                  <button 
                    onClick={() => sendGift('coffee')}
                    className="p-3 glass rounded-full hover:bg-amber-500/20 transition-all group border-amber-500/10"
                    title="Send coffee"
                  >
                    <Coffee className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
                  </button>
                  <button 
                    onClick={() => sendGift('heart')}
                    className="p-3 glass rounded-full hover:bg-red-500/20 transition-all group border-red-500/10"
                    title="Send love"
                  >
                    <Heart className="w-5 h-5 text-red-400 group-hover:scale-110 transition-transform" />
                  </button>
                </div>
              </motion.div>
            )}

            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Whisper something to Jeba..."
                className="w-full bg-white/5 border border-white/10 rounded-full py-4 pl-6 pr-16 focus:outline-none focus:border-rose-500/50 focus:bg-white/10 transition-all placeholder:text-white/20"
              />
              <button 
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:bg-rose-50 disabled:opacity-50 disabled:hover:bg-white transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-center text-[10px] text-white/20 mt-4 uppercase tracking-[0.2em]">
            Jeba is your digital partner. Every word is for you.
          </p>
        </div>
      </main>
    </div>
  </div>
);
}
