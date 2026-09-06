export function humanizeClaimError(message: string): string {
  if (message.includes("no copies available")) {
    return "Désolé — le dernier exemplaire vient d'être réservé par quelqu'un d'autre.";
  }
  if (message.includes("not authorized")) {
    return "Vous n'êtes pas autorisé à faire cela.";
  }
  if (message.includes("book not found")) {
    return "Ce livre n'existe plus.";
  }
  if (message.includes("duplicate key")) {
    return "Vous avez déjà réservé un exemplaire de ce livre.";
  }
  return "Une erreur est survenue. Merci de réessayer.";
}
