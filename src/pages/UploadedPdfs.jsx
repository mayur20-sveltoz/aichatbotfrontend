import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import API_BASE_URL from "../apiroute/apiConfig";
import { getPdf } from "../apiroute/chatbotApi";
import { Worker, Viewer } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

const UploadedPdfs = () => {
  const [pdfs, setPdfs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState(null);
  const defaultLayoutPluginInstance = defaultLayoutPlugin();
  // Upload State
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  // Search & Pagination State
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Confirmation Modal State (TOC Processing)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [uploadSessionId, setUploadSessionId] = useState(null);
  const [mediumPages, setMediumPages] = useState([]);
  const [selectedTocPages, setSelectedTocPages] = useState([]);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState("");

  const API = `${API_BASE_URL}/api/Document`;

  const loadPdfs = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem("token");

      const res = await axios.get(`${API}/all-pdfs`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setPdfs(res.data.files || res.data || []);
      setCurrentPage(1); // Reset page on load
    } catch (err) {
      console.error("Failed to load uploaded PDFs", err.response || err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPdfs(); }, []);

  // PDF Preview Blob Loader (Bypasses Iframe Auth Issues)
  useEffect(() => {
    let url = null;
    if (showConfirmModal && uploadSessionId) {
      const fetchPreview = async () => {
        try {
          const token = sessionStorage.getItem("token");
          const res = await axios.get(`${API}/preview/${uploadSessionId}`, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob'
          });
          url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
          setPreviewUrl(url);
        } catch (err) {
          console.error("Failed to load PDF preview", err);
        }
      };
      fetchPreview();
    } else {
      setPreviewUrl(null);
    }

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [showConfirmModal, uploadSessionId, API]);

  // Upload Logic
  const handleUploadPdfClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const executeConfirmApi = async (sessionId, selectedPages) => {
    setConfirmLoading(true);
    try {
      const token = sessionStorage.getItem("token");
      // const res = await axios.post(`${API}/confirm`,
      //   { sessionId, selectedPages },
      //   {
      //     headers: {
      //       "Content-Type": "application/json",
      //       Authorization: `Bearer ${token}`
      //     }
      //   }
      // );
      const res = await axios.post(`${API}/confirm`,
        { SessionId: sessionId, SelectedPages: selectedPages },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          }
        }
      );
      //alert(res.data?.message || "PDF uploaded and synced successfully!");
      setMessageText(res.data?.message || "PDF uploaded and synced successfully!");
      setShowMessageModal(true);
      setShowConfirmModal(false);

      // Cleanup states
      setUploadSessionId(null);
      setMediumPages([]);
      setSelectedTocPages([]);

      loadPdfs(); // Refresh the grid
    } //catch (err) {
    //   console.error("Confirm error:", err.response?.data || err);
    //   const errMsg = typeof err.response?.data === 'string' ? err.response.data : err.response?.data?.message || err.message || "Failed to confirm PDF handling";
    //   //alert("Processing failed: " + errMsg);
    //   setMessageText("Processing failed: " + errMsg);
    //   setShowMessageModal(true);
    // } finally {
    //   setConfirmLoading(false);
    // }
    catch (err) {
      console.error("Confirm error:", err.response?.data || err);

      let errMsg = "Failed to confirm PDF handling";

      if (err.response?.data?.errors) {
        const firstKey = Object.keys(err.response.data.errors)[0];
        errMsg = err.response.data.errors[firstKey][0];
      } else if (typeof err.response?.data === 'string') {
        errMsg = err.response.data;
      } else if (err.response?.data?.message) {
        errMsg = err.response.data.message;
      }

      setMessageText("Processing failed: " + errMsg);
      setShowMessageModal(true);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    e.target.value = ""; // Reset

    // Check if the file already exists in the grid
    const fileNameExists = pdfs.some(pdf => {
      const existingName = typeof pdf === "string" ? pdf : (pdf.fileName || pdf.FileName || pdf.name || pdf.Name);
      return existingName.toLowerCase() === file.name.toLowerCase();
    });

    if (fileNameExists) {
      setMessageText(`File "${file.name}" is already uploaded.`);
      setShowMessageModal(true);
      return; // Stop the upload
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true);
    try {
      const token = sessionStorage.getItem("token");
      // 1. Initial Upload API interaction
      const res = await axios.post(`${API_BASE_URL}/api/document/upload`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`
        }
      });

      const { sessionId, requiresConfirmation, mediumPages } = res.data;

      // 2. Fork logic depending on confidence requirements
      if (requiresConfirmation && Array.isArray(mediumPages) && mediumPages.length > 0) {
        // Trigger Popup
        setUploadSessionId(sessionId);
        setMediumPages(mediumPages);
        setSelectedTocPages([]); // Starts unchecked
        setShowConfirmModal(true);
      } else {
        // High confidence - automatically run confirm endpoint
        await executeConfirmApi(sessionId, []);
      }

    } catch (err) {
      console.error("Upload error:", err.response?.data || err);
      const errMsg = typeof err.response?.data === 'string' ? err.response.data : err.response?.data?.message || err.message || "Failed to upload PDF";
      //alert("Upload failed: " + errMsg);
      setMessageText("Upload failed: " + errMsg);
      setShowMessageModal(true);
    } finally {
      setIsUploading(false);
    }
  };

  const togglePageSelection = (pageNumber) => {
    if (selectedTocPages.includes(pageNumber)) {
      setSelectedTocPages(selectedTocPages.filter(p => p !== pageNumber));
    } else {
      setSelectedTocPages([...selectedTocPages, pageNumber]);
    }
  };

  // Actions
  const handleOpenClick = (fileName) => {
    //const url = getPdf(fileName);
    // window.open(url, "_blank", "noopener,noreferrer");
    setSelectedPdf(fileName);
    setShowPdfModal(true);
  };

  const handleShareClick = (fileName) => {
    // Action currently disabled as per request
    /*
    const url = getPdf(fileName);
    const fullUrl = url.startsWith('http') ? url : window.location.origin + url;
 
    if (navigator.clipboard) {
      navigator.clipboard.writeText(fullUrl)
        .then(() => alert("PDF link copied to clipboard!"))
        .catch(err => console.error("Could not copy text: ", err));
    } else {
      alert("Copy this link: \n" + fullUrl);
    }
    */
  };

  // Derived Data (Search & Pagination)
  const normalizedPdfs = Array.isArray(pdfs) ? pdfs : [];
  const filteredPdfs = normalizedPdfs.filter(pdf => {
    const fileName = typeof pdf === "string" ? pdf : (pdf.fileName || pdf.FileName || pdf.name || pdf.Name || "");
    return fileName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const totalPages = Math.ceil(filteredPdfs.length / itemsPerPage) || 1;
  const currentPdfs = filteredPdfs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="users-page">
      {/* Hidden File Input */}
      <input
        type="file"
        accept=".pdf"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* Confirmation Modal Overlay */}
      {showConfirmModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '16px', width: '97%', maxWidth: '1400px', height: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid var(--border-light)' }}>

            {/* Modal Header */}
            <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface)' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.25rem' }}>Select Table of Contents Pages</h3>

                <p style={{
                  margin: '6px 0 0',
                  fontSize: '13px',
                  color: 'var(--text-secondary)'
                }}>
                  Note: If none of the pages are Table of Contents, simply click "Confirm Selection" without selecting any page.
                </p>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={confirmLoading}
                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: confirmLoading ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', transition: 'all 0.2s' }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

              {/* Left Pane: Preview */}
              <div style={{ flex: 2.5, backgroundColor: 'var(--bg-dark)', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                <div style={{ width: '100%', height: '100%', backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                  {previewUrl ? (
                    <iframe
                      src={previewUrl}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      title="PDF Preview"
                    />
                  ) : (
                    <div style={{ color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                      <span className="btn-spinner" style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#E06580', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></span>
                      <span style={{ fontSize: '0.95rem', fontWeight: '500' }}>Loading preview securely...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Pane: Checkbox Controls */}
              <div style={{ flex: 1, padding: '2rem', overflowY: 'auto', borderLeft: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                  TOC Selection
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {mediumPages.map((pageNumber) => {
                    const isSelected = selectedTocPages.includes(pageNumber);
                    return (
                      <label key={pageNumber} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '1rem',
                        border: isSelected ? '1px solid #E06580' : '1px solid var(--border)',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        backgroundColor: isSelected ? 'rgba(224, 101, 128, 0.08)' : 'var(--bg-surface)',
                        boxShadow: isSelected ? '0 0 0 1px #E06580' : 'none'
                      }}>
                        <div style={{
                          width: '20px',
                          height: '20px',
                          border: isSelected ? 'none' : '2px solid var(--text-muted)',
                          borderRadius: '6px',
                          backgroundColor: isSelected ? '#E06580' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
                        }}>
                          {isSelected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => togglePageSelection(pageNumber)}
                          style={{ display: 'none' }}
                        />
                        <span style={{ fontSize: '1rem', fontWeight: '500', color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>Page {pageNumber}</span>
                      </label>
                    );
                  })}
                  {mediumPages.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
                      No pages flagged for confirmation.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1.25rem 2rem', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button
                onClick={() => executeConfirmApi(uploadSessionId, selectedTocPages)}
                disabled={confirmLoading}
                style={{
                  padding: '0.75rem 2rem',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#E06580',
                  color: '#fff',
                  fontWeight: '600',
                  fontSize: '0.95rem',
                  cursor: confirmLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  boxShadow: '0 4px 12px rgba(224, 101, 128, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => !confirmLoading && (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseOut={(e) => !confirmLoading && (e.currentTarget.style.transform = 'translateY(0)')}
              >
                {confirmLoading ? (
                  <><span className="btn-spinner" style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderRadius: '50%', borderTopColor: '#fff', animation: 'spin 1s linear infinite' }}></span> Processing...</>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    Confirm Selection
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
      {/* ✅ Message Popup Overlay */}
      {showMessageModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: "16px",
              width: "90%",
              maxWidth: "400px",
              padding: "2rem",
              textAlign: "center",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              border: "1px solid var(--border-light)",
              animation: "fadeIn 0.2s ease-out"
            }}
          >
            <div style={{
              width: "48px",
              height: "48px",
              backgroundColor: "rgba(224, 101, 128, 0.1)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem"
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E06580" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>

            <h3 style={{ margin: "0 0 0.5rem", color: "#fff", fontSize: "1.25rem", fontWeight: "600" }}>Notification</h3>

            <p style={{
              margin: "0 0 2rem",
              fontSize: "0.95rem",
              lineHeight: "1.5",
              color: "var(--text-secondary)"
            }}>
              {messageText}
            </p>

            <button
              onClick={() => setShowMessageModal(false)}
              style={{
                width: "100%",
                padding: "10px 24px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "#E06580",
                color: "#fff",
                fontWeight: "600",
                fontSize: "1rem",
                cursor: "pointer",
                transition: "transform 0.2s, background-color 0.2s",
                boxShadow: "0 4px 12px rgba(224, 101, 128, 0.3)"
              }}
              onMouseOver={(e) => e.target.style.transform = "translateY(-1px)"}
              onMouseOut={(e) => e.target.style.transform = "translateY(0)"}
            >
              Close
            </button>
          </div>
        </div>
      )}
      {/* ✅ CENTERED RESPONSIVE PDF MODAL */}
      {showPdfModal && selectedPdf && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          zIndex: 1200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px' // 🔥 spacing from all sides
        }}>

          <div style={{
            width: '100%',
            maxWidth: '1400px',       // desktop max width
            height: '90vh',
            background: '#fff',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
          }}>

            {/* Header */}
            <div style={{
              padding: '10px 15px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #ddd'
            }}>
              <span style={{
                fontWeight: '600',
                fontSize: '14px',
                color: '#000',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {selectedPdf}
              </span>

              <button
                onClick={() => setShowPdfModal(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: '18px',
                  cursor: 'pointer'
                }}
              >
                ❌
              </button>
            </div>

            {/* Viewer */}
            <div style={{
              flex: 1,
              overflow: 'hidden'
            }}>
              <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                <Viewer
                  fileUrl={getPdf(selectedPdf)}
                  plugins={[defaultLayoutPluginInstance]}
                />
              </Worker>
            </div>

          </div>
        </div>
      )}
      {/* Header */}
      <div className="users-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.3rem' }}>Library</h1>
          <p>View all PDFs successfully uploaded to the system</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            className="users-add-btn"
            onClick={handleUploadPdfClick}
            disabled={isUploading}
            style={{ backgroundColor: "#E06580", color: "#fff", borderColor: "#E06580", height: "40px" }}
          >
            {isUploading ? (
              <><span className="btn-spinner"></span> Uploading...</>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload PDF
              </>
            )}
          </button>

          <button
            className="users-add-btn"
            onClick={loadPdfs}
            style={{ backgroundColor: "#E06580", color: "#fff", borderColor: "#E06580", height: "40px" }}
            disabled={loading}
          >
            {loading ? (
              <><span className="btn-spinner"></span> Refreshing...</>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
                </svg>
                Refresh
              </>
            )}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="users-search-bar" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ minWidth: 'fit-content' }}>
          <span style={{ fontSize: '1rem', fontWeight: '500', color: '#4b5563' }}>Manage Documents</span>
        </div>
        <div style={{ position: 'relative', width: '100%', maxWidth: '320px', flex: '1 1 auto' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" width="18" height="18" style={{ position: 'absolute', left: '12px', top: '10px' }}>
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search PDFs by name..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            style={{ width: '100%', color: '#000', padding: '0.6rem 1rem 0.6rem 2.5rem', borderRadius: '8px', border: '1px solid #d1d5db', outline: 'none', fontSize: '0.95rem' }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>#</th>
              <th>PDF Name</th>
              <th>Size</th>
              <th>Pages</th>
              {/* <th>Status</th> */}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentPdfs.length === 0 ? (
              <tr>
                <td colSpan="6" className="users-empty">
                  {loading ? "Loading..." : "No PDFs found matching your criteria"}
                </td>
              </tr>
            ) : (
              currentPdfs.map((pdf, i) => {
                const globalIndex = (currentPage - 1) * itemsPerPage + i + 1;
                const fileName = typeof pdf === "string" ? pdf : (pdf.fileName || pdf.FileName || pdf.name || pdf.Name);
                const size = typeof pdf !== "string" && (pdf.size || pdf.Size) ? (pdf.size || pdf.Size) : "-";
                const pages = typeof pdf !== "string" && (pdf.pages || pdf.Pages) ? (pdf.pages || pdf.Pages) : "-";

                return (
                  <tr key={i}>
                    <td>{globalIndex}</td>
                    <td>
                      <div className="users-cell-user">
                        <div
                          className="users-avatar"
                          style={{ background: "#3b82f6", borderRadius: "8px", minWidth: "32px", height: "32px" }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" width="16" height="16">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <span style={{ whiteSpace: 'nowrap' }}>{fileName}</span>
                      </div>
                    </td>
                    <td>{size}</td>
                    <td>{pages}</td>
                    {/* <td>
                      <span className="users-status users-status-active">
                        <span className="users-status-dot"></span>
                        Available
                      </span>
                    </td> */}
                    <td style={{ minWidth: '190px' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="users-action-btn"
                          onClick={() => handleShareClick(fileName)}
                          style={{ backgroundColor: "#E06580", color: "#fff", borderColor: "#E06580", padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{ marginRight: '4px' }}>
                            <circle cx="18" cy="5" r="3" />
                            <circle cx="6" cy="12" r="3" />
                            <circle cx="18" cy="19" r="3" />
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                          </svg>
                          Share
                        </button>
                        <button
                          className="users-action-btn"
                          onClick={() => handleOpenClick(fileName)}
                          style={{ backgroundColor: "#E06580", color: "#fff", borderColor: "#E06580", padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{ marginRight: '4px' }}>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          Open
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredPdfs.length)} of {filteredPdfs.length} entries
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: currentPage === 1 ? '1px solid #E06580' : '1px solid #E06580', background: currentPage === 1 ? '#E06580' : '#E06580', color: currentPage === 1 ? '#fff' : '#fff', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: '500' }}
            >
              Previous
            </button>

            <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontWeight: '500', color: '#E06580', fontSize: '0.875rem' }}>
              Page {currentPage} of {totalPages}
            </div>

            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: currentPage === totalPages ? '1px solid #E06580' : '1px solid #E06580', background: currentPage === totalPages ? '#E06580' : '#E06580', color: currentPage === totalPages ? '#fff' : '#fff', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: '500' }}
            >
              Next
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default UploadedPdfs;
