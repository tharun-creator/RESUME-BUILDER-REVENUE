import 'dotenv/config';
// MVP: scan processing runs in-process inside apps/api for simplicity.
// Phase 2: move to BullMQ worker consuming Redis queue per PRD §8/§9.
console.log('Worker placeholder running. MVP processing is handled by API in-process queue.');
setInterval(() => {}, 1 << 30);
