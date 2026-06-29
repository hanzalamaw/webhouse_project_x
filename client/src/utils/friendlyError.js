const EXACT = {
  Forbidden: "You do not have permission to do this.",
  "No token provided": "Your session has ended. Please sign in again.",
  "Invalid token": "Your session has ended. Please sign in again.",
  "Invalid refresh token": "Your session has ended. Please sign in again.",
  "Session terminated": "Your session was ended on another device. Please sign in again.",
  "User not found": "We could not find your account. Please sign in again.",
  "Tenant account is not active": "This company account is not active. Contact your administrator.",
  "Invalid credentials": "The username or password is incorrect.",
  "NetworkError": "Could not connect. Check your internet connection and try again.",
  "Failed to fetch": "Could not connect. Check your internet connection and try again.",
  "Username is required": "Please enter a username.",
  "Username cannot contain spaces": "Usernames cannot contain spaces.",
  "Username already exists for this tenant": "That username is already taken. Please choose another.",
  "Password is required (min 6 characters)": "Please enter a password with at least 6 characters.",
  "Role not found": "The selected role could not be found. Please refresh and try again.",
  "Super Admin role cannot be assigned to new users": "The Super Admin role cannot be assigned to new users.",
  "Super Admin user role cannot be changed": "The Super Admin role cannot be changed.",
  "Super Admin role cannot be assigned to other users": "The Super Admin role cannot be assigned to other users.",
  "Super Admin is a reserved role": "Super Admin is a reserved role and cannot be created again.",
  "Session not found or already terminated": "That session has already ended.",
  "Session not found": "That session could not be found.",
  "Alert not found": "That alert could not be found.",
};

const CONTAINS = [
  { match: /request failed\s*\(\d+\)/i, text: "Something went wrong. Please try again." },
  { match: /network|failed to fetch|load failed/i, text: "Could not connect. Check your internet connection and try again." },
  { match: /json|syntax|unexpected token/i, text: "Something went wrong. Please try again." },
  { match: /sql|er_|duplicate entry|constraint/i, text: "This record could not be saved because it conflicts with existing data." },
  { match: /econnrefused|enotfound|timeout/i, text: "The server is not responding. Please try again in a moment." },
  { match: /active user limit reached/i, text: "You have reached the maximum number of active users allowed on your plan." },
  { match: /username already exists/i, text: "That username is already taken. Please choose another." },
];

export function friendlyError(message, status) {
  if (message == null || message === "") {
    if (status === 401 || status === 403) return "Your session has ended. Please sign in again.";
    if (status >= 500) return "Something went wrong on our side. Please try again later.";
    return "Something went wrong. Please try again.";
  }

  const raw = String(message).trim();
  if (EXACT[raw]) return EXACT[raw];

  for (const { match, text } of CONTAINS) {
    if (match.test(raw)) return text;
  }

  if (status === 401) return "Your session has ended. Please sign in again.";
  if (status === 403) return "You do not have permission to do this.";
  if (status === 404) return "The item you are looking for was not found.";
  if (status >= 500) return "Something went wrong on our side. Please try again later.";

  return raw;
}
