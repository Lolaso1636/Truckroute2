const API_BASE = "http://localhost:4000";

// --- Funciones API ---
async function login(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || "Login falló");
  localStorage.setItem("token", j.token);
  localStorage.setItem("user", JSON.stringify(j.user));
  return j;
}

async function register(email, password, display_name, tipo_camion) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name, tipo_camion }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || "Registro falló");

  // Guarda sesión y datos básicos
  localStorage.setItem("token", j.token);
  localStorage.setItem("user", JSON.stringify(j.user));

  // Guarda configuración del camión
  const truckConfig = {
    tipo: tipo_camion || "camion",
    pesoKg: 0,
    alto: "",
    ancho: "",
    meta: "",
  };
  localStorage.setItem("truckroute_truckConfig", JSON.stringify(truckConfig));

  return j;
}

// --- Eventos del DOM ---
document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");

  // --- LOGIN ---
  loginBtn.addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value.trim();
    const pass = document.getElementById("loginPass").value.trim();
    if (!email || !pass) {
      alert("Por favor completa los campos de correo y contraseña");
      return;
    }

    try {
      await login(email, pass);
      alert("Inicio de sesión exitoso ✅");
      window.location.href = "camion.html";
    } catch (err) {
      alert("Error: " + err.message);
    }
  });

  // --- REGISTRO ---
  registerBtn.addEventListener("click", async () => {
    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const pass = document.getElementById("regPass").value.trim();
    const tipo = document.getElementById("regTipo").value.trim();

    if (!name || !email || !pass) {
      alert("Por favor completa nombre, correo y contraseña");
      return;
    }

    try {
      await register(email, pass, name, tipo);
      alert("Cuenta creada correctamente 🎉");
      window.location.href = "camion.html";
    } catch (err) {
      alert("Error en el registro: " + err.message);
    }
  });
});
