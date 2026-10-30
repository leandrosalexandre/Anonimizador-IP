import { WrongPasswordError, VaultNameError, VaultNotFoundError } from '../vault/repository';
import { InvalidVaultFileError } from '../vault/exchange';

/** Mensagem em português para o usuário. Nunca inclui conteúdo do cofre. */
export function userMessage(error: unknown): string {
  if (
    error instanceof WrongPasswordError ||
    error instanceof VaultNameError ||
    error instanceof VaultNotFoundError ||
    error instanceof InvalidVaultFileError
  ) {
    return error.message;
  }
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'Não há espaço suficiente no aparelho para gravar o cofre.';
  }
  // Log apenas do tipo do erro (SPEC 2.6: sem conteúdo nos logs).
  console.error('Erro inesperado:', error instanceof Error ? error.name : typeof error);
  return 'Ocorreu um erro inesperado. Tente de novo.';
}
