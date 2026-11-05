/**
 * SHELLDOJO - MOTOR NORMALIZADOR Y VALIDADOR DE COMANDOS
 * Normaliza espacios múltiples, espacios alrededor de tuberías (|),
 * equivalencias comunes (ej. docker compose <-> docker-compose)
 * y banderas en Windows CMD.
 */

/**
 * Normaliza una cadena de comando para comparaciones justas y consistentes.
 * @param {string} rawCommand
 * @returns {string}
 */
export function normalizeCommandString(rawCommand) {
  if (typeof rawCommand !== 'string') return '';

  let cmd = rawCommand
    .trim()
    // Reemplaza múltiples espacios o tabulaciones por un único espacio
    .replace(/\s+/g, ' ')
    // Normaliza espacios alrededor de tuberías: "a|b", "a |b", "a| b" -> "a | b"
    .replace(/\s*\|\s*/g, ' | ');

  // Normaliza comillas simples a comillas dobles para que 'mensaje' y "mensaje" sean equivalentes
  cmd = cmd.replace(/'([^']*)'/g, '"$1"');

  // Equivalencia nativa: docker-compose <-> docker compose
  cmd = cmd.replace(/^docker-compose\b/i, 'docker compose');

  // Si es un comando de Windows (ipconfig, netstat, ping, tasklist, taskkill),
  // en CMD los comandos y modificadores (/F, /PID, /flushdns) son case-insensitive
  if (/^(ipconfig|netstat|ping|tasklist|taskkill)\b/i.test(cmd)) {
    cmd = cmd.toLowerCase();
  }

  return cmd;
}

/**
 * Valida la entrada del usuario contra un arreglo de respuestas válidas equivalentes.
 * @param {string} userInput - Comando ingresado por el estudiante
 * @param {string[]} validAnswersArray - Lista de soluciones aceptadas
 * @returns {boolean}
 */
export function validateCommand(userInput, validAnswersArray = []) {
  if (!userInput || !Array.isArray(validAnswersArray) || validAnswersArray.length === 0) {
    return false;
  }

  const normalizedUser = normalizeCommandString(userInput);
  if (!normalizedUser) return false;

  return validAnswersArray.some((validCandidate) => {
    const normalizedCandidate = normalizeCommandString(validCandidate);
    return normalizedUser === normalizedCandidate;
  });
}

