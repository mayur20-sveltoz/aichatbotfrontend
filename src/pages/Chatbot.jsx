import React, { useState, useRef, useEffect } from "react";
import { askQuestion, getPdf, getChatHistory } from "../apiroute/chatbotApi";
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { highlightPlugin } from '@react-pdf-viewer/highlight';

import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import '@react-pdf-viewer/highlight/lib/styles/index.css';


const ResultCard = ({ r, i, isTyping, typingText }) => {
  const pageNumber = React.useMemo(() => {
    if (Array.isArray(r.pages) && r.pages.length > 0) return r.pages[0];
    if (Array.isArray(r.Pages) && r.Pages.length > 0) return r.Pages[0];
    if (typeof r.pages === 'number') return r.pages;
    if (typeof r.Pages === 'number') return r.Pages;
    if (typeof r.page === 'number') return r.page;
    if (typeof r.Page === 'number') return r.Page;
    if (typeof r.pages === 'string' && r.pages.trim()) return Number(r.pages) || 1;
    if (typeof r.Pages === 'string' && r.Pages.trim()) return Number(r.Pages) || 1;
    return 1;
  }, [r.pages, r.Pages, r.page, r.Page]);
  const activePage = pageNumber || 1;
  const [showPdf, setShowPdf] = useState(false);

  const [highlightAreas, setHighlightAreas] = useState([]);

  // Normalizer
  const normalize = (text) => {
    if (!text) return "";
    return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  };

  // 1. & 2. Split the answer into meaningful chunks (sentences)
  const answerChunks = React.useMemo(() => {
    if (!r.summary) return [];
    let cleanAnswer = r.summary.replace(/\n/g, " ").replace(/(?:Answer:|Steps:|Source:.*|Page.*|\d+\.\s*|[-*]\s*)/gi, ' ');
    let sentences = cleanAnswer.split(/[.?!,;:]+\s+/).filter(s => {
      const trimmed = s.trim();
      return trimmed.length > 10 && trimmed.split(' ').length >= 3; // meaningful sentences
    });
    return sentences;
  }, [r.summary]);

  const displayedSummary = React.useMemo(() => {
    const rawSummary = r.summary || r.Summary || "";
    // Commented out left-side source/file name logic in the answer body
    // because source is now rendered in its own inline footer.
    return rawSummary.replace(/Source:\s*[\s\S]*$/i, '').trim();
  }, [r.summary, r.Summary]);

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
      const pageValues = Array.isArray(r.pages)
        ? r.pages
        : Array.isArray(r.Pages)
        ? r.Pages
        : [r.pages || r.Pages || r.page || r.Page];
      const targetPages = pageValues
        .filter(Boolean)
        .map((p) => Number(p))
        .filter((p) => !Number.isNaN(p))
        .map((p) => p - 1);

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
    <div className="chatbot-result-card">
      <div className="chatbot-result-card-header">
        <div className="chatbot-result-label">
          <span>Answer</span>
        </div>

        {r.avgScore !== undefined && (
          <div className="chatbot-score-badge">
            Score: {(r.avgScore * 100).toFixed(0)}%
          </div>
        )}
      </div>

      <div className="chatbot-result-summary" style={{ marginTop: '1rem', whiteSpace: 'pre-line' }}>
        {i === 0 && isTyping ? (
          <span className="chatbot-typing-text">
            {typingText}
            <span className="chatbot-cursor">|</span>
          </span>
        ) : (
          displayedSummary || "No answer available"
        )}
      </div>

      {(r.pages || r.Pages || r.fileName || r.FileName) && (
        <div className="chatbot-result-source">
          <span className="chatbot-result-source-label"></span>
          <span className="chatbot-result-source-text">
            Source: Page {activePage} | PDF file: {r.fileName || r.FileName}
            <button
              className="chatbot-source-view-icon"
              onClick={() => setShowPdf(!showPdf)}
              aria-label="View PDF"
            >
              &gt;
            </button>
          </span>
        </div>
      )}

      {showPdf && (r.fileName || r.FileName) && (
        <div className="chatbot-result-pdf" style={{ maxHeight: '420px', height: '420px', overflow: 'hidden', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '18px', marginTop: '1rem' }}>
          <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
            <Viewer
              key={`${r.fileName || r.FileName}-${activePage}`}
              fileUrl={getPdf(r.fileName || r.FileName)}
              plugins={[defaultLayoutPluginInstance, highlightPluginInstance, textExtractionPlugin]}
              initialPage={activePage > 0 ? activePage - 1 : 0}
            />
          </Worker>
        </div>
      )}
    </div>
  );
};

const Chatbot = () => {
  const [question, setQuestion] = useState("");
  const [conversation, setConversation] = useState([]);
  const [loading, setLoading] = useState(false);
  const [typingText, setTypingText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(sessionStorage.getItem("chatSessionId") || "");
  const [includeHistory, setIncludeHistory] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  //const [chatHistory, setChatHistory] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const inputRef = useRef(null);
  const chatScrollRef = useRef(null);

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

      // setChatHistory(
      //   Array.isArray(data)
      //     ? data
      //     : (data.messages || data.history || data.results || [])
      // );
      setSessions(data.sessions || []);

    } catch (err) {
      console.error("Failed to load chat history", err);
      // setChatHistory([]);
      setSessions([]);
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

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [conversation]);

  // Group history by date
  // const groupedHistory = React.useMemo(() => {
  //   const groups = {};
  //   chatHistory.forEach((item) => {
  //     // const label = formatHistoryDate(item.createdAt || item.timestamp || item.date);
  //     const label = formatHistoryDate(
  //       item.askedAt || item.createdAt || item.timestamp || item.date
  //     );
  //     if (!groups[label]) groups[label] = [];
  //     groups[label].push(item);
  //   });
  //   return groups;
  // }, [chatHistory]);

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
    setIsTyping(true);
    setTypingText("");

    try {
      const data = await askQuestion(question, sessionId, includeHistory);

      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        sessionStorage.setItem("chatSessionId", data.sessionId);
         setConversation([]);
      }

      const responseResults = data.results || [];
      const currentQuestion = question;
      setQuestion("");

      setConversation((prev) => [
        ...prev,
        {
          question: currentQuestion,
          results: responseResults,
          askedAt: new Date().toISOString(),
        },
      ]);
        await fetchHistory();
      // const newHistoryItem = {
      //   question: currentQuestion,
      //   answer: JSON.stringify(responseResults),
      //   askedAt: new Date().toISOString(),
      // };
      // setChatHistory((prev) => [newHistoryItem, ...prev]);

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
  // const handleHistoryClick = (item) => {
  //   const q =
  //     item.question ||
  //     item.Question ||
  //     item.query ||
  //     item.text ||
  //     "";

  //   if (q) {
  //     setQuestion(q);
  //   }

  //   if (item.answer || item.Answer) {
  //     try {
  //       let raw = item.answer || item.Answer;
  //       const parsedResults =
  //         typeof raw === "string" ? JSON.parse(raw) : raw;

  //       if (Array.isArray(parsedResults)) {
  //         const normalized = parsedResults.map((r) => ({
  //           fileName: r.fileName || r.FileName,
  //           pages: r.pages || r.Pages,
  //           avgScore: r.avgScore || r.AvgScore,
  //           summary: r.summary || r.Summary,
  //         }));

  //         setConversation((prev) => [
  //           ...prev,
  //           {
  //             question: q,
  //             results: normalized,
  //             askedAt: item.askedAt || item.createdAt || new Date().toISOString(),
  //           },
  //         ]);
  //         setIsTyping(false);
  //       }
  //     } catch (err) {
  //       console.error("Failed to parse history answer", err);
  //     }
  //   }

  //   if (window.innerWidth < 768) {
  //     setSidebarOpen(false);
  //   }
  // };

  return (
    <div className="chatbot-page" style={{ minHeight: '100vh', overflow: 'hidden' }}>
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
            <span>Recent</span>
          </div>
          <button className="chatbot-sidebar-close" onClick={() => setSidebarOpen(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="chatbot-sidebar-content" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 120px)' }}>
          {/* {historyLoading ? (
            <div className="chatbot-sidebar-loading">
              <div className="chatbot-typing-dots">
                <span></span><span></span><span></span>
              </div>
              <p>Loading history...</p>
            </div>
           ) : sessions.length === 0 ? (
            <div className="chatbot-sidebar-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p>No chat history yet</p>
              <span>Your conversations will appear here</span>
            </div>
           ) : (
            // Object.entries(groupedHistory).map(([dateLabel, items]) => (
            //   <div key={dateLabel} className="chatbot-sidebar-group">
            //     <div className="chatbot-sidebar-date">{dateLabel}</div>
            //     {items.map((item, idx) => (
            //       <button
            //         key={idx}
            //         className="chatbot-sidebar-item"
            //         onClick={() => handleHistoryClick(item)}
            //         title={item.question || item.query || item.text || ""}
            //       >
            //         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            //           <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            //         </svg>
            //         <span className="chatbot-sidebar-item-text">
            //           {item.question || item.query || item.text || "Untitled"}
            //         </span>
            //       </button>
            //     ))}
            //   </div>
            // ))
            {sessions.length === 0 ? (
            <div className="chatbot-sidebar-empty">
              <p>No chat history yet</p>
            </div>
            ) : (
            sessions.map((session) => (
              <button
                key={session.sessionId}
                className={`chatbot-sidebar-item ${session.sessionId === sessionId ? "active" : ""}`}
                onClick={() => {
                  setSessionId(session.sessionId);
                  sessionStorage.setItem("chatSessionId", session.sessionId);

                  // 🔥 LOAD FULL CHAT
                  const parsedConversation = session.messages.map((msg) => {
                    let parsedResults = [];

                    try {
                      parsedResults =
                        typeof msg.answer === "string"
                          ? JSON.parse(msg.answer)
                          : msg.answer;
                    } catch {}

                    return {
                      question: msg.question,
                      results: parsedResults,
                      askedAt: msg.askedAt,
                    };
                  });

                  setConversation(parsedConversation);

                  // mobile UX
                  if (window.innerWidth < 768) {
                    setSidebarOpen(false);
                  }
                }}
              >
                <span className="chatbot-sidebar-item-text">
                  {session.title || "New Chat"}
                </span>
              </button>
            ))
          )} */}
          {historyLoading ? (
  <div className="chatbot-sidebar-loading">
    <div className="chatbot-typing-dots">
      <span></span><span></span><span></span>
    </div>
    <p>Loading history...</p>
  </div>
) : sessions.length === 0 ? (
  <div className="chatbot-sidebar-empty">
    <p>No chat history yet</p>
  </div>
) : (
  sessions.map((session) => (
    <button
      key={session.sessionId}
      className={`chatbot-sidebar-item ${session.sessionId === sessionId ? "active" : ""}`}
      onClick={() => {
        setSessionId(session.sessionId);
        sessionStorage.setItem("chatSessionId", session.sessionId);

        const parsedConversation = session.messages.map((msg) => {
          let parsedResults = [];
          try {
            parsedResults =
              typeof msg.answer === "string"
                ? JSON.parse(msg.answer)
                : msg.answer;
          } catch {
            // ignore parse errors
          }

          return {
            question: msg.question,
            results: parsedResults,
            askedAt: msg.askedAt,
          };
        });

        setConversation(parsedConversation);

        if (window.innerWidth < 768) {
          setSidebarOpen(false);
        }
      }}
    >
      <span className="chatbot-sidebar-item-text">
        {session.title || "New Chat"}
      </span>
    </button>
  ))

          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="chatbot-main" style={{ height: '100vh', position: 'relative' }}>
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
        </div>

        <div className="chatbot-chat-area" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', padding: '24px 20px 140px' }}>
          <div ref={chatScrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {conversation.length === 0 && !loading ? (
              <div className="chatbot-empty-chat">
                <p>Your chat will appear here.</p>
                <span>Ask a question to begin the conversation.</span>
              </div>
            ) : conversation.length === 0 && loading ? (
              <div className="chatbot-loading">
                <div className="chatbot-typing-dots">
                  <span></span><span></span><span></span>
                </div>
                <p>Searching documents...</p>
              </div>
            ) : (
              conversation.map((item, msgIndex) => (
                <div key={msgIndex} className="chatbot-message-block">
                  <div className="chatbot-message-header">
                    <span className="chatbot-message-label" style={{display: "flex",justifyContent: "flex-end"}}>Q{msgIndex + 1}</span>
                    <div className="chatbot-message-text" style={{display: "flex",justifyContent: "flex-end"}}>{item.question}</div>
                  </div>
                  <div className="chatbot-answer-block">
                    <div className="chatbot-answer-meta">
                      <span className="chatbot-answer-label">Answer</span>
                      <span className="chatbot-answer-time">{new Date(item.askedAt).toLocaleString()}</span>
                    </div>
                    <div className="chatbot-answer-divider" />
                    <div className="chatbot-answer-cards">
                      {item.results.map((r, i) => {
                        const key = `${msgIndex}-${i}`;
                        return (
                          <ResultCard
                            key={key}
                            r={r}
                            i={i}
                            isTyping={isTyping && msgIndex === conversation.length - 1}
                            typingText={typingText}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="chatbot-input-area" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, background: '#0f1117db', padding: '1rem 20px 1rem',width: '100%' }}>
          <form onSubmit={ask} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '100%', margin: '0 auto' }}>
            <div className="chatbot-input-wrap" style={{ position: 'relative' }}>
              <textarea
                ref={inputRef}
                className="chatbot-textarea"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={placeholder + "|"}
                rows={3}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
                style={{ paddingRight: '3rem' }}
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  bottom: '0.75rem',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#4b5563'
                }}
                aria-label="Send question"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
                  <path d="M5 12h14" />
                  <path d="M13 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Press Enter to send, Shift+Enter for new line</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={includeHistory}
                  onChange={(e) => setIncludeHistory(e.target.checked)}
                  disabled={loading}
                />
                Include Conversation Context
              </label>
            </div>
          </form>
        </div>
      </div>{/* end chatbot-main */}
    </div>
  );
};

export default Chatbot;