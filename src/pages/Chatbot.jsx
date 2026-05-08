import React, { useState, useRef, useEffect, useCallback } from "react";
import { askQuestion, getPdf, getChatHistory } from "../apiroute/chatbotApi";
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
//import { highlightPlugin } from '@react-pdf-viewer/highlight';
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation';


import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
//import '@react-pdf-viewer/highlight/lib/styles/index.css';


const ResultCard = ({ r, i, isTyping, typingText }) => {
  const targetPages = React.useMemo(() => {
    const pages = r.pages ?? r.Pages ?? r.page ?? r.Page ?? [];
    if (Array.isArray(pages)) {
      return pages.map((p) => Number(p)).filter((p) => !Number.isNaN(p) && p > 0);
    }
    if (typeof pages === 'string') {
      return pages
        .split(/[,;\s]+/)
        .map((p) => Number(p.trim()))
        .filter((p) => !Number.isNaN(p) && p > 0);
    }
    if (typeof pages === 'number') {
      return [pages];
    }
    return [];
  }, [r.pages, r.Pages, r.page, r.Page]);

  //const activePage = targetPages[0] || 1;
  const answerPage =
    r.answerPage ||
    r.AnswerPage ||
    targetPages[0] ||
    1;
  
  const activePage = answerPage;
  const pdfContainerRef = useRef(null);
  const [showPdf, setShowPdf] = useState(false);

  //const [highlightAreas, setHighlightAreas] = useState([]);

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
  const hasValidPdf =
  !!(r.fileName || r.FileName) &&
  (r.fileName || r.FileName) !== "No Match" &&
  !!displayedSummary &&
  displayedSummary.trim() !==
    "Try rephrasing your question or using more specific keywords.";
  // const highlightAnswerInPdf = useCallback(() => {

  //   setTimeout(() => {

  //     const currentPageLayer = document.querySelector(
  //       `[data-testid="core__page-layer-${activePage - 1}"]`
  //     );

  //     if (!currentPageLayer) {
  //       return;
  //     }

  //     const textLayers = currentPageLayer.querySelectorAll(
  //       '.rpv-core__text-layer span'
  //     );
  //     if (!textLayers.length) {
  //       return;
  //     }

  //     // remove old highlights
  //     textLayers.forEach((span) => {
  //       span.style.background = 'rgba(255, 242, 0, 0.95)';
  //       span.style.color = '';
  //       span.style.borderRadius = '';
  //       span.style.padding = '';
  //     });

  //     const answerText = normalize(displayedSummary);

  //     if (!answerText) {
  //       return;
  //     }

  //     const answerWords = answerText
  //       .split(' ')
  //       .filter(word => word.length > 3);

  //     let firstMatchedElement = null;

  //     textLayers.forEach((span) => {

  //       const spanText = normalize(
  //         span.textContent || ''
  //       );

  //       if (!spanText) {
  //         return;
  //       }

  //       let matched = 0;

  //       answerWords.forEach((word) => {

  //         if (
  //           spanText.includes(word)
  //         ) {
  //           matched++;
  //         }

  //       });

  //       // relaxed matching
  //       if (
  //         matched >= 1 ||
  //         answerText.includes(spanText)
  //       ) 
  //       {

  //         span.style.background =
  //           'rgba(255, 255, 0, 0.95)';

  //         span.style.color = '#000';

  //         span.style.borderRadius = '3px';

  //         span.style.padding = '1px 2px';

  //         if (!firstMatchedElement) {
  //           firstMatchedElement = span;
  //         }
  //       }

  //     });

  //     // auto jump to first highlight
  //     if (firstMatchedElement) {

  //       firstMatchedElement.scrollIntoView({
  //         behavior: 'instant',
  //         block: 'center',
  //       });

  //     }

  //   }, 2500);

  // },[activePage, displayedSummary, answerChunks]);

  const pageNavigationPluginInstance =
    pageNavigationPlugin();

  const { jumpToPage } =
    pageNavigationPluginInstance;

  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  const highlightAnswerInPdf = useCallback(() => {

    const timer = setTimeout(() => {

      const viewerContainer =
        //document.querySelector('.chatbot-result-pdf');
        pdfContainerRef.current;

      if (!viewerContainer) {
        return;
      }

      // CLEAR OLD HIGHLIGHTS
      viewerContainer
        .querySelectorAll('.rpv-core__text-layer span')
        .forEach((span) => {

          span.style.background = '';
          span.style.color = '';
          span.style.borderRadius = '';
          span.style.padding = '';

        });

      // CLEAN ANSWER
      const cleanAnswer = normalize(
        displayedSummary
          .replace(/Source:\s*[\s\S]*$/i, '')
          .replace(/\n/g, ' ')
      );

      if (!cleanAnswer || cleanAnswer.length < 20) {
        return;
      }

      // BREAK ANSWER INTO MEANINGFUL LINES
      const answerChunks = cleanAnswer
        .split(/[.?!]\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 15);

      let firstMatchedElement = null;
      let matchedPage = null;
      let foundFirstMatch = false;
      const MAX_PAGES_TO_SCAN = 15;
      // CHECK CURRENT PAGE + NEXT 5 PAGES
      for (
        let offset = 0;
        offset <= MAX_PAGES_TO_SCAN;
        offset++
      ) {

        const pageIndex =
          (activePage - 1) + offset;

        const pageLayer = viewerContainer.querySelector(
          `[data-testid="core__page-layer-${pageIndex}"]`
        );

        if (!pageLayer) {
          continue;
        }

        const spans = Array.from(
          pageLayer.querySelectorAll(
            '.rpv-core__text-layer span'
          )
        );

        if (!spans.length) {
          continue;
        }

        // COMBINE FULL PAGE TEXT
        const fullPageText = normalize(
          spans
            .map((s) => s.textContent || '')
            .join(' ')
        );

        // CHECK IF ANSWER EXISTS IN PAGE
        let pageMatched = false;

        for (const chunk of answerChunks) {

          if (
            fullPageText.includes(chunk)
          ) {
            pageMatched = true;
            break;
          }

          // RELAXED MATCHING
          const chunkWords = chunk
            .split(' ')
            .filter((w) => w.length > 4);

          const matchedWords =
            chunkWords.filter((word) =>
              fullPageText.includes(word)
            );

          const score =
            matchedWords.length /
            chunkWords.length;

          if (score >= 0.6) {
            pageMatched = true;
            break;
          }

        }

        // IF PAGE MATCH FOUND
        if (pageMatched) {

          if (!foundFirstMatch) {

            matchedPage = pageIndex;

            foundFirstMatch = true;

          }

          // HIGHLIGHT MATCHING SPANS
          spans.forEach((span) => {

            const spanText = normalize(
              span.textContent || ''
            );

            if (
              !spanText ||
              spanText.length < 3
            ) {
              return;
            }

            let isMatched = false;

            answerChunks.forEach((chunk) => {

              // DIRECT MATCH
              // if (
              //   chunk.includes(spanText)
              // ) {
              //   isMatched = true;
              // }
              if (
                chunk.includes(spanText) ||
                spanText.includes(chunk)
              ) {
                isMatched = true;
              }
              // WORD MATCH SCORE
              const chunkWords = chunk
                .split(' ')
                .filter((w) => w.length > 4);

              const matchedWords =
                chunkWords.filter((word) =>
                  spanText.includes(word)
                );

              const score =
                matchedWords.length /
                chunkWords.length;

              // if (score >= 0.5) {
              //   isMatched = true;
              // }
              if (
                score >= 0.35 ||
                matchedWords.length >= 2
              ) {
                isMatched = true;
              }
            });

            if (isMatched) {

              span.style.background =
                'rgba(255, 255, 0, 0.95)';

              span.style.color = '#000';

              span.style.borderRadius = '4px';

              span.style.padding = '2px 3px';

              if (!firstMatchedElement) {
                firstMatchedElement = span;
              }

            }

          });

          // STOP AFTER FIRST MATCHED PAGE
          //break;

        }

      }

      // AUTO SCROLL TO MATCH
      if (firstMatchedElement) {

        firstMatchedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });

      }

      // AUTO JUMP TO MATCHED PAGE
      if (
        matchedPage !== null &&
        matchedPage !== (activePage - 1)
      ) {

        jumpToPage(matchedPage);

      }

    }, 2200);

    return () => clearTimeout(timer);

  }, [
    activePage,
    displayedSummary
  ]);


  useEffect(() => {

    if (showPdf) {

      highlightAnswerInPdf();

    }

  }, [showPdf, activePage, highlightAnswerInPdf]);

  useEffect(() => {

    if (showPdf && activePage > 0) {

      setTimeout(() => {

        jumpToPage(activePage - 1);

      }, 800);

    }

  }, [showPdf, activePage]);
  return (
    <div className="chatbot-result-card">
      <div className="chatbot-result-card-header">
        <div className="chatbot-result-label">
          <span>Answer</span>
        </div>

        {(r.avgScore !== undefined ||
  r.AvgScore !== undefined) && (

  <div className="chatbot-score-badge">

    Score: {(
      (
        r.avgScore ??
        r.AvgScore ??
        0
      ) * 100
    ).toFixed(0)}%

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

      {hasValidPdf && (
        <div className="chatbot-result-source">
          <span className="chatbot-result-source-label"></span>
          <span className="chatbot-result-source-text">
            Answer found on Page {answerPage}

            {targetPages.length > 1 && (
              <>
                {" "} | Related Pages: {targetPages.join(", ")}
              </>
            )}

            {" "} | PDF file: {r.fileName || r.FileName}

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

      {showPdf && hasValidPdf && (
        <div ref={pdfContainerRef} className="chatbot-result-pdf" style={{ maxHeight: '420px', height: '420px', overflow: 'hidden', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '18px', marginTop: '1rem' }}>
          <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
            {/* <Viewer
              key={`${r.fileName || r.FileName}-${activePage}`}
              fileUrl={getPdf(r.fileName || r.FileName)}
              plugins={[defaultLayoutPluginInstance, highlightPluginInstance, textExtractionPlugin]}
              initialPage={activePage > 0 ? activePage - 1 : 0}
            /> */}
            <Viewer
              key={`${r.fileName || r.FileName}-${activePage}`}
              fileUrl={getPdf(r.fileName || r.FileName)}
              plugins={[
                defaultLayoutPluginInstance,

                pageNavigationPluginInstance
              ]}
              initialPage={activePage > 0 ? activePage - 1 : 0}

            //renderPage={(props) => props.canvasLayer.children}
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
  const [pendingQuestion, setPendingQuestion] = useState(null);
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
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "52px";
    }
  }, []);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await getChatHistory();

      console.log("History API Response:", data); // debug


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
      // chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
      chatScrollRef.current.scrollTop =
        chatScrollRef.current.scrollHeight;
    }
  }, [conversation]);

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
    const currentQuestion = question;

   setPendingQuestion(currentQuestion);

setQuestion("");
    try {
      const data = await askQuestion(question, sessionId, includeHistory);

      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        sessionStorage.setItem("chatSessionId", data.sessionId);
        setConversation([]);
      }

      const responseResults = data.results || [];
      const currentQuestion = question;
      setPendingQuestion(currentQuestion);
      setQuestion("");

      setConversation((prev) => [
        ...prev,
        {
          question: currentQuestion,
          results: responseResults,
          askedAt: new Date().toISOString(),
        },
      ]);
      setPendingQuestion(null);
      await fetchHistory();


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
      setPendingQuestion(null);
      setIsTyping(false);
    } finally {
      setLoading(false);
    }
  };

  const startNewChat = () => {
    setConversation([]);
    setSessionId("");
    sessionStorage.removeItem("chatSessionId");
    setQuestion("");
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
            <span>Recent</span>
          </div>
          <button
            className="chatbot-sidebar-new-chat"
            onClick={startNewChat}
            aria-label="Start new chat"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              width: '36px',
              height: '36px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '9999px',
              transition: 'background 0.2s ease',
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="18"
              height="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
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


                  setTimeout(() => {
                    if (chatScrollRef.current) {
                      chatScrollRef.current.scrollTop =
                        chatScrollRef.current.scrollHeight;
                    }
                  }, 50);

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
        </div>

        <div className="chatbot-chat-area">

          <div
            ref={chatScrollRef}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto'
            }}
          >

            {/* EMPTY STATE */}
            {conversation.length === 0 && !loading && (
              <div className="chatbot-empty-chat">
                <p>How can I assist you today?</p>
                <span>Ask a question to begin the conversation.</span>
              </div>
            )}

            {/* EXISTING CONVERSATIONS */}
            {conversation.map((item, msgIndex) => (

              <div
                key={msgIndex}
                className="chatbot-message-block"
              >

                <div className="chatbot-message-header">

                  <span
                    className="chatbot-message-label"
                    style={{
                      display: "flex",
                      justifyContent: "flex-end"
                    }}
                  >
                    Q{msgIndex + 1}
                  </span>

                  <div
                    className="chatbot-message-text"
                    style={{
                      display: "flex",
                      justifyContent: "flex-end"
                    }}
                  >
                    {item.question}
                  </div>

                </div>

                <div className="chatbot-answer-block">

                  <div className="chatbot-answer-meta">

                    <span className="chatbot-answer-label">
                      Answer
                    </span>

                    <span className="chatbot-answer-time">
                      {new Date(item.askedAt).toLocaleString()}
                    </span>

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
                          isTyping={
                            isTyping &&
                            msgIndex === conversation.length - 1
                          }
                          typingText={typingText}
                        />
                      );

                    })}

                  </div>

                </div>

              </div>

            ))}

            {/* PENDING LOADER */}
            {loading && pendingQuestion && (

              <div className="chatbot-message-block">

                <div className="chatbot-message-header">

                  <span
                    className="chatbot-message-label"
                    style={{
                      display: "flex",
                      justifyContent: "flex-end"
                    }}
                  >
                    Q{conversation.length + 1}
                  </span>

                  <div
                    className="chatbot-message-text"
                    style={{
                      display: "flex",
                      justifyContent: "flex-end"
                    }}
                  >
                    {pendingQuestion}
                  </div>

                </div>

                <div className="chatbot-loading">

                  <div className="chatbot-typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>

                  <p>Searching</p>

                </div>

              </div>

            )}

          </div>

        </div>

        <div className="chatbot-input-fixed">
          <form onSubmit={ask} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '100%', margin: '0 auto' }}>
            <div className="chatbot-input-wrap" style={{ position: 'relative' }}>
              {/* <textarea
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
              /> */}
              <textarea
                ref={inputRef}
                className="chatbot-textarea"
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);

                  // 🔥 Auto height adjust
                  const textarea = e.target;

                  textarea.style.height = "auto";

                  // max height limit
                  const maxHeight = 140;

                  if (textarea.scrollHeight <= maxHeight) {
                    textarea.style.height = textarea.scrollHeight + "px";
                    textarea.style.overflowY = "hidden";
                  } else {
                    textarea.style.height = maxHeight + "px";
                    textarea.style.overflowY = "auto";
                  }
                }}
                placeholder={placeholder + "|"}
                rows={1}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
                style={{
                  paddingRight: '3rem',
                  minHeight: '52px',
                  maxHeight: '140px',
                  resize: 'none',
                  overflowY: 'hidden',
                  lineHeight: '1.5',
                }}
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
            {/* <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
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
            </div> */}
            <div className="chatbot-input-bottom">
              <div className="chatbot-context-checkbox">
                <input
                  type="checkbox"
                  id="includeHistory"
                  checked={includeHistory}
                  onChange={(e) => setIncludeHistory(e.target.checked)}
                  disabled={loading}
                />

                <label htmlFor="includeHistory">
                  Include Conversation Context
                </label>
              </div>

              <div className="chatbot-input-hint">
                Press Enter to send, Shift+Enter for new line
              </div>
            </div>
          </form>
        </div>
      </div>{/* end chatbot-main */}
    </div>
  );
};

export default Chatbot;