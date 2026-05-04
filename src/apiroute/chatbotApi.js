import axios from "axios";
import API_BASE_URL from "./apiConfig";

// export const askQuestion = async (question, sessionId = null, includeHistory = true) => {
//   const payload = { question, includeHistory };
//   if (sessionId) payload.sessionId = sessionId;

//   const res = await axios.post(
//     `${API_BASE_URL}/api/ChatBot`,
//     payload,
//     {
//       headers: {
//         Authorization: `Bearer ${sessionStorage.getItem("token")}`
//       }
//     }
//   );
//   return res.data;
// };
export const askQuestion = async (question, sessionId = null, includeHistory = true) => {
  const payload = {
    Question: question,
    IncludeHistory: includeHistory
  };

  // ✅ FIX HERE
  if (sessionId && sessionId !== "undefined" && sessionId !== "null") {
    payload.SessionId = sessionId;
  }

  try {
    const res = await axios.post(
      `${API_BASE_URL}/api/ChatBot`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("token")}`
        }
      }
    );

    return res.data;

  } catch (err) {
    // 🔥 ADD THIS DEBUG HERE
    console.log("FULL ERROR:", err);
    console.log("RESPONSE:", err.response);
    console.log("ERROR DATA:", err.response?.data);

    throw err; // optional (so UI still handles error)
  }
};

export const getPdf = (fileName) => {
  return `${API_BASE_URL}/api/Chatbot/pdf?fileName=${encodeURIComponent(fileName)}`;
};

export const getChatHistory = async () => {
  const res = await axios.get(
    `${API_BASE_URL}/api/chatbot/history`,
    {
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`
      }
    }
  );
  return res.data;
};