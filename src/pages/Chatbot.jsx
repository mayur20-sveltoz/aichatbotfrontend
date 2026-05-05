import React, { useState, useRef, useEffect } from "react";
import { askQuestion, getPdf, getChatHistory } from "../apiroute/chatbotApi";
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { highlightPlugin } from '@react-pdf-viewer/highlight';

import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import '@react-pdf-viewer/highlight/lib/styles/index.css';


const ResultCard = ({ r, i, isTyping, typingText, question, isExpanded, onToggle }) => {
  const [activePage, setActivePage] = useState(r.pages?.[0] || 1);
  const [showPdf, setShowPdf] = useState(false);

  const [highlightAreas, setHighlightAreas] = useState([]);

  // Normalizer
  const normalize = (text) => {
    if (!text) return "";
    return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  };

  // 1. & 2. Split the answer into meaningful chunks (sentences or 8–12 word groups)
  const answerChunks = React.useMemo(() => {
    if (!r.summary) return [];
    let cleanAnswer = r.summary.replace(/\n/g, " ").replace(/(?:Answer:|Steps:|Source:.*|Page.*|\d+\.\s*|[-*]\s*)/gi, ' ');
    let sentences = cleanAnswer.split(/[.?!,;:]+\s+/);
    let chunks = [];

    sentences.forEach(s => {
      const words = normalize(s).split(' ').filter(Boolean);
      if (words.length >= 4) { // ignore very small chunks
        if (words.length <= 12) {
          chunks.push(words.join(' '));
        } else {
          // overlapping 8-12 word groups
          for (let i = 0; i < words.length; i += 8) {
            let chunk = words.slice(i, i + 12).join(' ');
            if (chunk.split(' ').length >= 4) {
              chunks.push(chunk);
            }
          }
        }
      }
    });

    if (chunks.length === 0 && question) {
      chunks = [normalize(question)];
    }
    return chunks;
  }, [r.summary, question]);

  // const highlightPluginInstance = highlightPlugin({
  //   renderHighlights: (props) => {
  //     const pageAreas = highlightAreas.filter(area => area.pageIndex === props.pageIndex && props.pageIndex === activePage - 1);
  const highlightPluginInstance = highlightPlugin({
    renderHighlights: (props) => {
      const targetPages = (r.pages || r.Pages || []).map(p => p - 1);

      const pageAreas = highlightAreas.filter(
        area =>
          area.pageIndex === props.pageIndex &&
          targetPages.includes(props.pageIndex)
      );
      return (
        <div>
          {pageAreas.map((area, idx) => (
            <div
              key={idx}
              style={Object.assign(
                {},
                {
                  background: 'rgba(253, 253, 0, 0.52)', // Proper highlighter yellow
                  position: 'absolute',
                },
                props.getCssProperties(area, props.rotation)
              )}
            />
          ))}
        </div>
      );
    }
  });

  const textExtractionPlugin = {
    onTextLayerRender: (e) => {
      const textSpans = Array.from(e.ele.querySelectorAll('.rpv-core__text-layer-text'));
      if (!textSpans.length || answerChunks.length === 0) return;

      const pageRect = e.ele.getBoundingClientRect();
      let matchedItems = [];

      textSpans.forEach((span) => {
        const spanTextItem = span.textContent;
        let normSpanText = normalize(spanTextItem);

        // Strip leading numbers from the pdf span (e.g., "1 ") to allow matching fragments perfectly
        const stripMatch = normSpanText.match(/^\d+\s+(.*)$/);
        if (stripMatch) {
          normSpanText = stripMatch[1];
        }

        const spanWords = normSpanText.split(' ').filter(Boolean);

        // Ignore small characters or single-word items unless substantial
        if (spanWords.length < 2 && normSpanText.length < 5) return;

        let isMatch = false;
        for (let chunk of answerChunks) {
          const chunkWords = chunk.split(' ');

          if (normSpanText.includes(chunk) || chunk.includes(normSpanText)) {
            if (Math.min(normSpanText.length, chunk.length) >= 10 || chunk.length / normSpanText.length >= 0.5 || normSpanText.length / chunk.length >= 0.5) {
              isMatch = true; break;
            }
          }

          // Strong similarity: evaluate word overlap
          if (!isMatch && spanWords.length >= 3 && chunkWords.length >= 3) {
            let matchCount = 0;
            spanWords.forEach(w => { if (w.length > 2 && chunkWords.includes(w)) matchCount++; });

            let longWords = spanWords.filter(w => w.length > 2);
            if (longWords.length > 0 && (matchCount / longWords.length >= 0.7)) {
              isMatch = true; break;
            }
          }
        }

        if (isMatch) {
          const spanRect = span.getBoundingClientRect();
          matchedItems.push({
            pageIndex: e.pageIndex,
            left: ((spanRect.left - pageRect.left) / pageRect.width) * 100,
            top: ((spanRect.top - pageRect.top) / pageRect.height) * 100,
            width: (spanRect.width / pageRect.width) * 100,
            height: (spanRect.height / pageRect.height) * 100,
          });
        }
      });

      // Merge consecutive items using completely safe bounding box union math
      const mergedAreas = [];
      matchedItems.sort((a, b) => {
        if (Math.abs(a.top - b.top) < 1.0) return a.left - b.left;
        return a.top - b.top;
      });

      if (matchedItems.length > 0) {
        let currentArea = { ...matchedItems[0] };
        for (let i = 1; i < matchedItems.length; i++) {
          const item = matchedItems[i];
          // If on same line (within ~1.5%) and horizontally adjacent/close or overlapping
          if (Math.abs(currentArea.top - item.top) < 1.5 && (item.left <= currentArea.left + currentArea.width + 5)) {
            const newLeft = Math.min(currentArea.left, item.left);
            const newRight = Math.max(currentArea.left + currentArea.width, item.left + item.width);
            currentArea.left = newLeft;
            currentArea.width = newRight - newLeft;
            currentArea.top = Math.min(currentArea.top, item.top);
            currentArea.height = Math.max(currentArea.height, item.height);
          } else {
            mergedAreas.push(currentArea);
            currentArea = { ...item };
          }
        }
        mergedAreas.push(currentArea);
      }

      // setHighlightAreas(prev => {
      //   const existingForOtherPages = prev.filter(area => area.pageIndex !== e.pageIndex);
      //   const newAreas = [...existingForOtherPages, ...mergedAreas];
      //   if (JSON.stringify(prev) !== JSON.stringify(newAreas)) {
      //     return newAreas;
      //   }
      //   return prev;
      // });
      // setHighlightAreas(prev => {
      //   // Ignore non-active pages completely
      //   if (e.pageIndex !== activePage - 1) return prev;

      //   // Only store highlights for current active page
      //   const newAreas = mergedAreas.map(area => ({
      //     ...area,
      //     pageIndex: e.pageIndex
      //   }));

      //   // Optional: prevent unnecessary re-render
      //   if (JSON.stringify(prev) !== JSON.stringify(newAreas)) {
      //     return newAreas;
      //   }

      //   return prev;
      // });
      const targetPages = (r.pages || r.Pages || []).map(p => p - 1);

      setHighlightAreas(prev => {
        // Only process result pages
        if (!targetPages.includes(e.pageIndex)) return prev;

        const otherPages = prev.filter(a => a.pageIndex !== e.pageIndex);

        const newAreas = mergedAreas.map(area => ({
          ...area,
          pageIndex: e.pageIndex
        }));

        // avoid unnecessary re-render
        const currentAreasForPage = prev.filter(
          a => a.pageIndex === e.pageIndex
        );

        if (
          JSON.stringify(currentAreasForPage) ===
          JSON.stringify(newAreas)
        ) {
          return prev;
        }

        return [...otherPages, ...newAreas];
      });
    }
  };
  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  return (
    <div className={`chatbot-result-card ${isExpanded ? "expanded" : ""}`}>
      <div className="chatbot-result-header" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingRight: '0.25rem' }}>
        <div className="chatbot-result-file">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          <span>{r.fileName || r.FileName}</span>
        </div>

        {isExpanded && (r.pages || r.Pages)?.length > 0 && (
          <div className="chatbot-result-pages">
            <span className="mr-2">Pages:</span>
            <div className="flex gap-1" style={{ display: 'flex', gap: '0.25rem' }}>
              {(r.pages || r.Pages)?.map((p) => (
                <button
                  key={p}
                  className={`chatbot-page-num ${activePage === p ? "chatbot-page-num-active" : ""}`}
                  onClick={() => setActivePage(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {r.avgScore !== undefined && (
          <div className="chatbot-result-score" style={{ marginLeft: "auto", fontSize: "0.875rem", fontWeight: "600", color: "#6b7280" }}>
            Score: {(r.avgScore * 100).toFixed(0)}%
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: r.avgScore === undefined ? 'auto' : '0' }}>
          {isExpanded && (
            <button
              className="chatbot-pdf-toggle"
              onClick={() => setShowPdf(!showPdf)}
            >
              {showPdf ? "▼ Hide PDF" : "▶ View PDF"}
            </button>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0.25rem", color: "#4b5563", borderRadius: "50%"
            }}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            <svg
              width="24" height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateRows: isExpanded ? "1fr" : "0fr",
          transition: "grid-template-rows 0.3s ease-in-out"
        }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div style={{ opacity: isExpanded ? 1 : 0, transition: "opacity 0.3s ease-in-out" }}>
            <div className="chatbot-result-summary" style={{ marginTop: isExpanded ? '1rem' : 0 }}>
              {i === 0 && isTyping ? (
                <span className="chatbot-typing-text">
                  {typingText}
                  <span className="chatbot-cursor">|</span>
                </span>
              ) : (
                <div style={{ whiteSpace: "pre-line" }}>
                  {r.summary || r.Summary || "No answer available"}
                </div>
              )}
            </div>
            {showPdf && r.fileName && (
              <div className="chatbot-result-pdf" style={{ height: '600px', border: '1px solid #ccc', marginTop: '1rem' }}>
                <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                  <Viewer
                    key={`${r.fileName}-${activePage}`}
                    fileUrl={getPdf(r.fileName)}
                    plugins={[defaultLayoutPluginInstance, highlightPluginInstance, textExtractionPlugin]}
                    initialPage={activePage > 0 ? activePage - 1 : 0}
                  />
                </Worker>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Chatbot = () => {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [results, setResults] = useState([]);
  const [expandedResultIdx, setExpandedResultIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [typingText, setTypingText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showQuestionPanel, setShowQuestionPanel] = useState(true);
  const [showResultsPanel, setShowResultsPanel] = useState(true);
  const [sessionId, setSessionId] = useState(sessionStorage.getItem("chatSessionId") || "");
  const [includeHistory, setIncludeHistory] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);

  // Typing animation for the placeholder
  // const placeholders = [
  //   "Ask me anything about your documents...",
  //   "Search across all your PDFs...",
  //   "What would you like to know?",
  //   "Type your question here..."
  // ];
  const placeholders = React.useMemo(() => [
  "Ask me anything about your documents...",
  "Search across all your PDFs...",
  "What would you like to know?",
  "Type your question here..."
], []);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholder, setPlaceholder] = useState("");
  const [charIdx, setCharIdx] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (!token) {
      window.location.href = "/";
    }
  }, []);

  // Fetch chat history on mount
  // const fetchHistory = async () => {
  //   setHistoryLoading(true);
  //   try {
  //     const data = await getChatHistory();
  //     setChatHistory(Array.isArray(data) ? data : (data.history || data.results || []));
  //   } catch (err) {
  //     console.error("Failed to load chat history", err);
  //     setChatHistory([]);
  //   } finally {
  //     setHistoryLoading(false);
  //   }
  // };
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await getChatHistory();

      console.log("History API Response:", data); // debug

      setChatHistory(
        Array.isArray(data)
          ? data
          : (data.messages || data.history || data.results || [])
      );

    } catch (err) {
      console.error("Failed to load chat history", err);
      setChatHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (token) {
      fetchHistory();
    }
  }, []);

  // Helper: format date for grouping
  const formatHistoryDate = (dateStr) => {
    if (!dateStr) return "Unknown";
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

    const diffDays = Math.floor((today - date) / (1000 * 60 * 60 * 24));
    if (diffDays < 7) return "Previous 7 Days";
    if (diffDays < 30) return "Previous 30 Days";
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Group history by date
  const groupedHistory = React.useMemo(() => {
    const groups = {};
    chatHistory.forEach((item) => {
      // const label = formatHistoryDate(item.createdAt || item.timestamp || item.date);
      const label = formatHistoryDate(
        item.askedAt || item.createdAt || item.timestamp || item.date
      );
      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });
    return groups;
  }, [chatHistory]);

  // useEffect(() => {
  //   const current = placeholders[placeholderIdx];
  //   let timeout;

  //   if (!isDeleting && charIdx <= current.length) {
  //     timeout = setTimeout(() => {
  //       setPlaceholder(current.slice(0, charIdx));
  //       setCharIdx(charIdx + 1);
  //     }, 50);
  //   } else if (!isDeleting && charIdx > current.length) {
  //     timeout = setTimeout(() => setIsDeleting(true), 2000);
  //   } else if (isDeleting && charIdx > 0) {
  //     timeout = setTimeout(() => {
  //       setPlaceholder(current.slice(0, charIdx - 1));
  //       setCharIdx(charIdx - 1);
  //     }, 30);
  //   } else if (isDeleting && charIdx === 0) {
  //     setIsDeleting(false);
  //     setPlaceholderIdx((placeholderIdx + 1) % placeholders.length);
  //   }

  //   return () => clearTimeout(timeout);
  // }, [charIdx, isDeleting, placeholderIdx]);
  useEffect(() => {
  const current = placeholders[placeholderIdx];
  let timeout;

  if (!isDeleting && charIdx <= current.length) {
    timeout = setTimeout(() => {
      setPlaceholder(current.slice(0, charIdx));
      setCharIdx(charIdx + 1);
    }, 50);
  } else if (!isDeleting && charIdx > current.length) {
    timeout = setTimeout(() => setIsDeleting(true), 2000);
  } else if (isDeleting && charIdx > 0) {
    timeout = setTimeout(() => {
      setPlaceholder(current.slice(0, charIdx - 1));
      setCharIdx(charIdx - 1);
    }, 30);
  } else if (isDeleting && charIdx === 0) {
    setIsDeleting(false);
    setPlaceholderIdx((placeholderIdx + 1) % placeholders.length);
  }

  return () => clearTimeout(timeout);
}, [charIdx, isDeleting, placeholderIdx, placeholders]);

  const ask = async (e) => {
    e?.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setSubmittedQuestion(question);
    setIsTyping(true);
    setTypingText("");

    try {
      const data = await askQuestion(question, sessionId, includeHistory);

      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        sessionStorage.setItem("chatSessionId", data.sessionId);
      }

      const responseResults = data.results || [];
      setResults(responseResults);
      setExpandedResultIdx(0);

      // ✅ ADD THIS BLOCK (IMPORTANT)
      const newHistoryItem = {
        question: question,
        answer: JSON.stringify(responseResults),
        askedAt: new Date().toISOString()
      };

      setChatHistory(prev => [newHistoryItem, ...prev]); // add on top
      // Simulate typing effect for the first result summary
      if (responseResults.length > 0 && responseResults[0].summary) {
        const text = responseResults[0].summary;
        let i = 0;
        const typeInterval = setInterval(() => {
          setTypingText(text.slice(0, i + 1));
          i++;
          if (i >= text.length) {
            clearInterval(typeInterval);
            setIsTyping(false);
          }
        }, 15);
      } else {
        setIsTyping(false);
      }
    } catch (err) {
      console.error("Failed to ask question", err);
      setIsTyping(false);
    } finally {
      setLoading(false);
    }
  };

  // Handle clicking a history item to re-ask the question
  // const handleHistoryClick = (item) => {
  //   //const q = item.question || item.query || item.text || "";
  //   const q =
  //     item.question ||
  //     item.Question ||
  //     item.query ||
  //     item.text ||
  //     "";
  //   if (q) {
  //     setQuestion(q);
  //     inputRef.current?.focus();
  //   }
  //   // Close sidebar on mobile
  //   if (window.innerWidth < 768) {
  //     setSidebarOpen(false);
  //   }
  // };
  const handleHistoryClick = (item) => {
    const q =
      item.question ||
      item.Question ||
      item.query ||
      item.text ||
      "";

    if (q) {
      setQuestion(q);
      setSubmittedQuestion(q);
    }

    // 🔥 NEW: Parse answer and show in results panel
    // if (item.answer || item.Answer) {
    //   try {
    //     const parsedResults = JSON.parse(item.answer || item.Answer);

    //     if (Array.isArray(parsedResults)) {
    //       setResults(parsedResults);
    //       setIsTyping(false);
    //     }
    //   } catch (err) {
    //     console.error("Failed to parse history answer", err);
    //   }
    // }

    if (item.answer || item.Answer) {
      try {
        let raw = item.answer || item.Answer;

        // 🔥 handle already parsed case
        const parsedResults =
          typeof raw === "string" ? JSON.parse(raw) : raw;

        if (Array.isArray(parsedResults)) {
          // normalize keys (important)
          const normalized = parsedResults.map(r => ({
            fileName: r.fileName || r.FileName,
            pages: r.pages || r.Pages,
            avgScore: r.avgScore || r.AvgScore,
            summary: r.summary || r.Summary
          }));

          setResults(normalized);
          setExpandedResultIdx(0);
          setIsTyping(false);
        }
      } catch (err) {
        console.error("Failed to parse history answer", err);
      }
    }

    // Close sidebar on mobile
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="chatbot-page">
      {/* Sidebar Overlay */}
      {sidebarOpen && <div className="chatbot-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* History Sidebar */}
      <aside className={`chatbot-sidebar ${sidebarOpen ? 'chatbot-sidebar-open' : ''}`}>
        <div className="chatbot-sidebar-header">
          <div className="chatbot-sidebar-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Chat History</span>
          </div>
          <button className="chatbot-sidebar-close" onClick={() => setSidebarOpen(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="chatbot-sidebar-content" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 120px)' }}>
          {historyLoading ? (
            <div className="chatbot-sidebar-loading">
              <div className="chatbot-typing-dots">
                <span></span><span></span><span></span>
              </div>
              <p>Loading history...</p>
            </div>
          ) : chatHistory.length === 0 ? (
            <div className="chatbot-sidebar-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p>No chat history yet</p>
              <span>Your conversations will appear here</span>
            </div>
          ) : (
            Object.entries(groupedHistory).map(([dateLabel, items]) => (
              <div key={dateLabel} className="chatbot-sidebar-group">
                <div className="chatbot-sidebar-date">{dateLabel}</div>
                {items.map((item, idx) => (
                  <button
                    key={idx}
                    className="chatbot-sidebar-item"
                    onClick={() => handleHistoryClick(item)}
                    title={item.question || item.query || item.text || ""}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="chatbot-sidebar-item-text">
                      {item.question || item.query || item.text || "Untitled"}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="chatbot-main">
        {/* Header */}
        <div className="chatbot-header">
          <button className="chatbot-sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle chat history">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="chatbot-header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <div className="chatbot-header-pulse"></div>
          </div>
          <div className="chatbot-header-info">
            <h1>SmartAI Assistant</h1>
            <p>Ask questions about your documents and get instant answers</p>
          </div>
          <div className="chatbot-header-buttons">
            <button onClick={() => setShowQuestionPanel(!showQuestionPanel)}>
              {showQuestionPanel ? "Close Question Panel" : "Open Question Panel"}
            </button>
            <button onClick={() => setShowResultsPanel(!showResultsPanel)}>
              {showResultsPanel ? "Close Results Panel" : "Open Results Panel"}
            </button>
          </div>
        </div>

        {/* Two-panel layout */}
        <div className="chatbot-panels">
          {/* Question Panel */}
          {showQuestionPanel && (
            <div className="chatbot-panel chatbot-question-panel">
              <div className="chatbot-panel-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                Ask a Question
              </div>

              <form className="chatbot-input-area" onSubmit={ask}>
                <div className="chatbot-input-wrap">
                  <textarea
                    ref={inputRef}
                    className="chatbot-textarea"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder={placeholder + "|"}
                    rows={4}
                    disabled={loading}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        ask();
                      }
                    }}
                  />
                  <div className="chatbot-input-hint" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Press Enter to send, Shift+Enter for new line</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', pointerEvents: 'auto' }}>
                      <input
                        type="checkbox"
                        checked={includeHistory}
                        onChange={(e) => setIncludeHistory(e.target.checked)}
                        disabled={loading}
                      />
                      Include Conversation Context
                    </label>
                  </div>
                </div>
                <button type="submit" className="chatbot-send-btn" disabled={loading || !question.trim()}>
                  {loading ? (
                    <><span className="btn-spinner"></span> Searching...</>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                      Ask
                    </>
                  )}
                </button>
              </form>

              {/* Recent/suggestion chips */}
              <div className="chatbot-suggestions">
                <span className="chatbot-suggestion-label">Try:</span>
                {["How to fix blurred print issues in the printer?", "How to resolve blank or white pages issue?", "How to troubleshoot Ghost images check?", "What are the steps for Dark print check?"].map((s, i) => (
                  <button
                    key={i}
                    className="chatbot-chip"
                    onClick={() => { setQuestion(s); inputRef.current?.focus(); }}
                    disabled={loading}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Results Panel */}
          {showResultsPanel && (
            <div className="chatbot-panel chatbot-results-panel" ref={resultsRef}>
              <div className="chatbot-panel-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                Results
              </div>

              {results.length === 0 && !loading ? (
                <div className="chatbot-empty">
                  <div className="chatbot-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <p>Your answers will appear here</p>
                  <span>Ask a question to get started</span>
                </div>
              ) : loading ? (
                <div className="chatbot-loading">
                  <div className="chatbot-typing-dots">
                    <span></span><span></span><span></span>
                  </div>
                  <p>Searching documents...</p>
                </div>
              ) : (
                <div className="chatbot-results-list">
                  {results.map((r, i) => (
                    <ResultCard
                      key={i}
                      r={r}
                      i={i}
                      isTyping={isTyping}
                      typingText={typingText}
                      question={submittedQuestion}
                      isExpanded={expandedResultIdx === i}
                      onToggle={() => setExpandedResultIdx(expandedResultIdx === i ? -1 : i)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>{/* end chatbot-main */}
    </div>
  );
};

export default Chatbot;