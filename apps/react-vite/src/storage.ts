const sessionTokenKey = 'org-access-example.session-token';

export const getStoredSessionToken = () => window.localStorage.getItem(sessionTokenKey);

export const setStoredSessionToken = (token: string) => {
  window.localStorage.setItem(sessionTokenKey, token);
};

export const clearStoredSessionToken = () => {
  window.localStorage.removeItem(sessionTokenKey);
};
