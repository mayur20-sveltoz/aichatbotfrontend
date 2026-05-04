import React, { createContext, useContext, useState, useEffect } from "react";

const CategoryContext = createContext();

export const CategoryProvider = ({ children }) => {
  const [selectedCategory, setSelectedCategory] = useState(localStorage.getItem("selectedCategory") || "");

  const categories = [
    { id: "Manual", label: "Manual" },
    { id: "printer", label: "Printer" },
    { id: "atm", label: "ATM" },
    { id: "laptop", label: "Laptop" }
  ];

  useEffect(() => {
    if (selectedCategory) {
      localStorage.setItem("selectedCategory", selectedCategory);
    } else {
      localStorage.removeItem("selectedCategory");
    }
  }, [selectedCategory]);

  return (
    <CategoryContext.Provider value={{ selectedCategory, setSelectedCategory, categories }}>
      {children}
    </CategoryContext.Provider>
  );
};

export const useCategory = () => {
  const context = useContext(CategoryContext);
  if (!context) {
    throw new Error("useCategory must be used within a CategoryProvider");
  }
  return context;
};
