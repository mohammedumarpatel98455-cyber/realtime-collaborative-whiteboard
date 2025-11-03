import React, { useState, useRef, useEffect } from 'react';
import { Pencil, Square, Circle, Type, Eraser, Undo, Redo, Trash2, Download, Users, MessageSquare, Minus } from 'lucide-react';
import io from 'socket.io-client';

const socket = io('http://localhost:3001');

const Whiteboard = () => {
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('pencil');
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(3);
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textPosition, setTextPosition] = useState(null);
  const [startPos, setStartPos] = useState(null);
  const [sessionId] = useState('session-' + Math.random().toString(36).substr(2, 9));
  const [userName] = useState('User' + Math.floor(Math.random() * 1000));
  const [remoteCursors, setRemoteCursors] = useState({});
  const [fillShape, setFillShape] = useState(false);

  // Initialize canvas and socket connection
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    overlayCanvas.width = overlayCanvas.offsetWidth;
    overlayCanvas.height = overlayCanvas.offsetHeight;
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveHistory();

    // Join session
    socket.emit('join-session', {
      sessionId,
      user: { name: userName, color: getRandomColor() }
    });

    // Socket listeners
    socket.on('canvas-state', (data) => {
      if (data.canvasData) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          saveHistory();
        };
        img.src = data.canvasData;
      }
      setUsers(data.users || []);
      setMessages(data.messages || []);
    });

    socket.on('draw', (data) => {
      drawFromRemote(data);
    });

    socket.on('canvas-update', (data) => {
      if (data.canvasData) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
        };
        img.src = data.canvasData;
      }
    });

    socket.on('chat-message', (data) => {
      setMessages(prev => [...prev, data]);
    });

    socket.on('users-update', (data) => {
      setUsers(data);
    });

    socket.on('cursor-move', (data) => {
      setRemoteCursors(prev => ({
        ...prev,
        [data.userId]: { x: data.x, y: data.y, userName: data.userName, userColor: data.userColor }
      }));
    });

    socket.on('user-left', (data) => {
      setRemoteCursors(prev => {
        const newCursors = { ...prev };
        delete newCursors[data.userId];
        return newCursors;
      });
    });

    return () => {
      socket.off('canvas-state');
      socket.off('draw');
      socket.off('canvas-update');
      socket.off('chat-message');
      socket.off('users-update');
      socket.off('cursor-move');
      socket.off('user-left');
    };
  }, [sessionId, userName]);

  const getRandomColor = () => {
    const colors = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const saveHistory = () => {
    const canvas = canvasRef.current;
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(canvas.toDataURL());
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX || e.touches?.[0]?.clientX) - rect.left,
      y: (e.clientY || e.touches?.[0]?.clientY) - rect.top
    };
  };

  const drawFromRemote = (data) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.lineWidth;
    ctx.fillStyle = data.color;

    if (data.tool === 'pencil' || data.tool === 'eraser') {
      if (data.tool === 'eraser') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = data.lineWidth * 3;
      }
      ctx.beginPath();
      ctx.moveTo(data.points[0].x, data.points[0].y);
      data.points.forEach(point => {
        ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    } else if (data.tool === 'rectangle') {
      const { start, end } = data;
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
      if (data.fill) {
        ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
      }
    } else if (data.tool === 'circle') {
      const { start, end } = data;
      const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
      ctx.beginPath();
      ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
      ctx.stroke();
      if (data.fill) {
        ctx.fill();
      }
    } else if (data.tool === 'line') {
      const { start, end } = data;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  };

  const startDrawing = (e) => {
    const coords = getCoordinates(e);
    
    if (tool === 'text') {
      setTextPosition(coords);
      return;
    }
    
    setIsDrawing(true);
    setStartPos(coords);
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (tool === 'pencil' || tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }
  };

  const draw = (e) => {
    const coords = getCoordinates(e);
    
    // Emit cursor position
    socket.emit('cursor-move', { x: coords.x, y: coords.y, sessionId });
    
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (tool === 'pencil') {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
      
      // Emit drawing
      socket.emit('draw', {
        tool: 'pencil',
        color,
        lineWidth,
        points: [coords]
      });
    } else if (tool === 'eraser') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = lineWidth * 3;
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
      
      socket.emit('draw', {
        tool: 'eraser',
        lineWidth,
        points: [coords]
      });
    } else if (['rectangle', 'circle', 'line'].includes(tool)) {
      drawPreview(coords);
    }
  };

  const drawPreview = (coords) => {
    if (!startPos) return;
    
    const overlayCanvas = overlayCanvasRef.current;
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = 0.5;
    
    if (tool === 'rectangle') {
      ctx.strokeRect(startPos.x, startPos.y, coords.x - startPos.x, coords.y - startPos.y);
      if (fillShape) {
        ctx.fillRect(startPos.x, startPos.y, coords.x - startPos.x, coords.y - startPos.y);
      }
    } else if (tool === 'circle') {
      const radius = Math.sqrt(Math.pow(coords.x - startPos.x, 2) + Math.pow(coords.y - startPos.y, 2));
      ctx.beginPath();
      ctx.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
      ctx.stroke();
      if (fillShape) {
        ctx.fill();
      }
    } else if (tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    }
    
    ctx.globalAlpha = 1.0;
  };

  const stopDrawing = (e) => {
    if (!isDrawing) return;
    
    const coords = getCoordinates(e);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const overlayCanvas = overlayCanvasRef.current;
    const overlayCtx = overlayCanvas.getContext('2d');
    
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    
    if (tool === 'rectangle') {
      ctx.strokeRect(startPos.x, startPos.y, coords.x - startPos.x, coords.y - startPos.y);
      if (fillShape) {
        ctx.fillRect(startPos.x, startPos.y, coords.x - startPos.x, coords.y - startPos.y);
      }
      
      socket.emit('draw', {
        tool: 'rectangle',
        color,
        lineWidth,
        fill: fillShape,
        start: startPos,
        end: coords
      });
    } else if (tool === 'circle') {
      const radius = Math.sqrt(Math.pow(coords.x - startPos.x, 2) + Math.pow(coords.y - startPos.y, 2));
      ctx.beginPath();
      ctx.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
      ctx.stroke();
      if (fillShape) {
        ctx.fill();
      }
      
      socket.emit('draw', {
        tool: 'circle',
        color,
        lineWidth,
        fill: fillShape,
        start: startPos,
        end: coords
      });
    } else if (tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
      
      socket.emit('draw', {
        tool: 'line',
        color,
        lineWidth,
        start: startPos,
        end: coords
      });
    }
    
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    setIsDrawing(false);
    saveHistory();
    
    // Broadcast canvas update
    socket.emit('canvas-update', {
      sessionId,
      canvasData: canvas.toDataURL()
    });
  };

  const handleTextSubmit = () => {
    if (!textInput || !textPosition) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.font = `${lineWidth * 8}px Arial`;
    ctx.fillText(textInput, textPosition.x, textPosition.y);
    
    setTextInput('');
    setTextPosition(null);
    saveHistory();
    
    socket.emit('canvas-update', {
      sessionId,
      canvasData: canvas.toDataURL()
    });
  };

  const undo = () => {
    if (historyStep > 0) {
      setHistoryStep(historyStep - 1);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = history[historyStep - 1];
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        socket.emit('canvas-update', {
          sessionId,
          canvasData: canvas.toDataURL()
        });
      };
    }
  };

  const redo = () => {
    if (historyStep < history.length - 1) {
      setHistoryStep(historyStep + 1);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = history[historyStep + 1];
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        socket.emit('canvas-update', {
          sessionId,
          canvasData: canvas.toDataURL()
        });
      };
    }
  };

  const clearCanvas = () => {
    if (!window.confirm('Clear canvas for everyone?')) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveHistory();
    
    socket.emit('canvas-update', {
      sessionId,
      canvasData: canvas.toDataURL()
    });
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `whiteboard-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    
    socket.emit('chat-message', {
      sessionId,
      user: userName,
      text: chatInput,
      timestamp: new Date().toISOString()
    });
    
    setChatInput('');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-md p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Pencil className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Collaborative Whiteboard</h1>
              <p className="text-xs text-gray-500">Session: {sessionId}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg">
              <Users size={18} className="text-gray-600" />
              <span className="text-sm font-medium">{users.length} online</span>
            </div>
            <button
              onClick={() => setShowChat(!showChat)}
              className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
            >
              <MessageSquare size={18} />
              Chat
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="bg-white shadow-lg p-3 flex flex-col gap-2 w-20">
          <button
            onClick={() => setTool('pencil')}
            className={`p-3 rounded-lg ${tool === 'pencil' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            <Pencil size={20} />
          </button>
          <button
            onClick={() => setTool('eraser')}
            className={`p-3 rounded-lg ${tool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            <Eraser size={20} />
          </button>
          <button
            onClick={() => setTool('line')}
            className={`p-3 rounded-lg ${tool === 'line' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            <Minus size={20} />
          </button>
          <button
            onClick={() => setTool('rectangle')}
            className={`p-3 rounded-lg ${tool === 'rectangle' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            <Square size={20} />
          </button>
          <button
            onClick={() => setTool('circle')}
            className={`p-3 rounded-lg ${tool === 'circle' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            <Circle size={20} />
          </button>
          <button
            onClick={() => setTool('text')}
            className={`p-3 rounded-lg ${tool === 'text' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            <Type size={20} />
          </button>
          
          {(tool === 'rectangle' || tool === 'circle') && (
            <button
              onClick={() => setFillShape(!fillShape)}
              className={`p-2 rounded-lg text-xs ${fillShape ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              Fill
            </button>
          )}
          
          <div className="border-t border-gray-300 my-1"></div>
          
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-12 h-12 rounded-lg cursor-pointer"
          />
          
          <input
            type="range"
            min="1"
            max="20"
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="w-12"
          />
          
          <div className="border-t border-gray-300 my-1"></div>
          
          <button onClick={undo} disabled={historyStep <= 0} className="p-3 rounded-lg bg-gray-100">
            <Undo size={20} />
          </button>
          <button onClick={redo} disabled={historyStep >= history.length - 1} className="p-3 rounded-lg bg-gray-100">
            <Redo size={20} />
          </button>
          <button onClick={clearCanvas} className="p-3 rounded-lg bg-red-100 text-red-600">
            <Trash2 size={20} />
          </button>
          <button onClick={downloadCanvas} className="p-3 rounded-lg bg-green-100 text-green-600">
            <Download size={20} />
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 p-6">
          <div className="bg-white rounded-lg shadow-lg relative h-full">
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />
            <canvas
              ref={overlayCanvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              className="absolute top-0 left-0 w-full h-full cursor-crosshair"
            />
            
            {/* Text Input */}
            {textPosition && (
              <div
                className="absolute bg-white p-4 rounded-lg shadow-xl border-2 border-blue-500"
                style={{ left: textPosition.x, top: textPosition.y }}
              >
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleTextSubmit()}
                  placeholder="Enter text..."
                  autoFocus
                  className="border rounded px-3 py-2 mb-3 w-64"
                />
                <div className="flex gap-2">
                  <button onClick={handleTextSubmit} className="flex-1 bg-blue-500 text-white px-4 py-2 rounded">
                    Add
                  </button>
                  <button onClick={() => setTextPosition(null)} className="flex-1 bg-gray-300 px-4 py-2 rounded">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Remote Cursors */}
            {Object.entries(remoteCursors).map(([userId, cursor]) => (
              <div
                key={userId}
                className="absolute pointer-events-none"
                style={{ left: cursor.x, top: cursor.y }}
              >
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cursor.userColor }}></div>
                <div className="text-xs px-2 py-1 rounded mt-1" style={{ backgroundColor: cursor.userColor, color: 'white' }}>
                  {cursor.userName}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Panel */}
        {showChat && (
          <div className="w-80 bg-white shadow-lg flex flex-col">
            <div className="p-4 border-b bg-blue-500">
              <h2 className="text-lg font-semibold text-white">Team Chat</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, idx) => (
                <div key={idx} className="bg-gray-100 rounded-lg p-3">
                  <div className="font-medium text-sm text-blue-600">{msg.user}</div>
                  <p className="text-sm text-gray-700">{msg.text}</p>
                </div>
              ))}
            </div>
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={sendMessage}
                  className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Whiteboard;