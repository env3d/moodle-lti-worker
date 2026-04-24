export const base64url = (obj) => {
  const str = typeof obj === "string" ? obj : JSON.stringify(obj);
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};

export const decodeJwtPayload = (idToken) => {
  return JSON.parse(atob(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
};
