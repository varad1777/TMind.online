
export default function Settings() {

  return (
  
    <div className="flex flex-col items-center justify-center h-full w-full">
      <h1>Settings</h1>
      <p className="text-sm text-muted-foreground text-center mb-2">Under Development</p>
    </div>
  );
}







// import React, { useEffect, useState } from "react";
// import { getCurrentUser, updateUser } from "@/api/userApi";
// import { toast } from "react-toastify";

// export default function Settings() {
//   const [user, setUser] = useState<any>(null);
//   const [loading, setLoading] = useState(true);
//   const [updating, setUpdating] = useState(false);
//   const [username, setUsername] = useState("");
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [errors, setErrors] = useState<{ username?: string; email?: string; password?: string }>({});

//   // Load current user
//   useEffect(() => {
//     const fetchUser = async () => {
//       try {
//         const data = await getCurrentUser();
//         setUser(data);
//         setUsername(data.username);
//         setEmail(data.email);
//         setPassword("");
//       } catch (err) {
//         console.error("Failed to fetch user", err);
//         toast.error("Failed to fetch user info");
//       } finally {
//         setLoading(false);
//       }
//     };
//     fetchUser();
//   }, []);

//   // Validation function
//   const validate = () => {
//     const newErrors: typeof errors = {};
//     if (!username || username.length < 3) newErrors.username = "Username must be at least 3 characters.";
//     if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) newErrors.email = "Invalid email format.";
//     if (password) {
//       const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
//       if (!passwordRegex.test(password)) {
//         newErrors.password = "Password must include uppercase, lowercase, number, and symbol (min 8 chars).";
//       }
//     }
//     setErrors(newErrors);
//     return Object.keys(newErrors).length === 0;
//   };

//   const handleUpdate = async () => {
//     if (!user) return;
//     if (!validate()) return;

//     setUpdating(true);
//     try {
//       const payload: any = { username, email, role: user.role };
//       if (password) payload.password = password;

//       await updateUser(user.userId, payload);
//       toast.success("User updated successfully!");
//       setPassword("");
//     } catch (err) {
//       console.error("Failed to update user", err);
//       toast.error("Update failed. Please check your inputs.");
//     } finally {
//       setUpdating(false);
//     }
//   };

//   if (loading) return <div className="text-center mt-4">Loading user info...</div>;

//   return (
//     <div className="flex flex-col items-center justify-center h-full w-full">
//       <form
//         onSubmit={(e) => { e.preventDefault(); handleUpdate(); }}
//         className="flex flex-col gap-3 w-full max-w-sm bg-card border border-border rounded-xl shadow p-6"
//         style={{ minHeight: "300px", maxHeight: "100%", overflow: "hidden" }}
//       >
//         <h1 className="text-xl font-semibold text-center mb-2">Settings</h1>
//         <p className="text-sm text-muted-foreground text-center mb-2">Update your account information</p>

//         {/* Username */}
//         <div>
//           <label className="block text-sm mb-1 font-medium">Username</label>
//           <input
//             type="text"
//             value={username}
//             onChange={(e) => setUsername(e.target.value)}
//             className="w-full bg-background text-foreground border border-border rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/60 placeholder:text-muted-foreground"
//             placeholder="Enter username"
//           />
//           {errors.username && <p className="text-red-500 text-xs mt-1">{errors.username}</p>}
//         </div>

//         {/* Email */}
//         <div>
//           <label className="block text-sm mb-1 font-medium">Email</label>
//           <input
//             type="email"
//             value={email}
//             onChange={(e) => setEmail(e.target.value)}
//             className="w-full bg-background text-foreground border border-border rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/60 placeholder:text-muted-foreground"
//             placeholder="Enter email"
//           />
//           {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
//         </div>

//         {/* Password */}
//         <div>
//           <label className="block text-sm mb-1 font-medium">Password</label>
//           <input
//             type="password"
//             value={password}
//             onChange={(e) => setPassword(e.target.value)}
//             className="w-full bg-background text-foreground border border-border rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/60 placeholder:text-muted-foreground"
//             placeholder="Enter new password"
//           />
//           <p className="text-xs text-gray-500 mt-1">Leave blank if you do not want to change the password</p>
//           {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
//         </div>

//         {/* Update Button */}
//         <button
//           type="submit"
//           disabled={updating}
//           className={`mt-1 w-full py-2 rounded-md font-medium transition-all ${
//             updating
//               ? "bg-primary/70 text-primary-foreground cursor-not-allowed"
//               : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
//           }`}
//         >
//           {updating ? (
//             <div className="flex items-center justify-center gap-2">
//               <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
//               Updating...
//             </div>
//           ) : (
//             "Update Settings"
//           )}
//         </button>
//       </form>
//     </div>
//   );
// }
