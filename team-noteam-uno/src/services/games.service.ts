// src/services/games.service.ts

import { Socket } from 'socket.io';
import { memeTemplates } from '../game/memeTemplates';
import { ScoringSystem } from '../game/scoring';
import { pool } from '../config/database';

export interface MemeSubmission {
    playerId: string;
    username: string;
    captions: string[];
    votes: string[]; // array of player IDs who voted for this submission
}

export interface Round {
    memeTemplate: {
        id: string;
        url: string;
        captionFields: number; // number of text fields needed
    };
    submissions: MemeSubmission[];
    status: 'submitting' | 'voting' | 'results';
    timeLeft: number;
}

export interface Player {
    id: string;
    userId?: number;
    username: string;
    socket: Socket;
    connected?: boolean;
    score: number;
    hasSubmitted?: boolean;
    hasVoted?: boolean,
    currentVoteIndex?: number; // NEW
}

export interface Game {
    id: string;
    passcode: string;
    players: Player[];
    status: 'waiting' | 'playing' | 'finished';
    createdAt: Date;
    currentRound: number;
    totalRounds: number;
    roundTime: number; // time in seconds for each submission phase
    votingTime: number; // time in seconds for voting phase
    round?: Round;
    winner?: {
        userId?: number;
        username: string;
        score: number;
    };
}

class GamesService {
    private static instance: GamesService;
    private games: Map<string, Game> = new Map();
    private memeTemplates = memeTemplates;
    private timers: Map<string, NodeJS.Timeout> = new Map();

    private constructor() {}

    public static getInstance(): GamesService {
        if (!GamesService.instance) {
            GamesService.instance = new GamesService();
        }
        return GamesService.instance;
    }

    getGame(passcode: string): Game | undefined {
        return this.games.get(passcode);
    }

    getGameById(id: string): Game | undefined {
        return this.games.get(id);
    }

    getAllGames(): Game[] {
        return Array.from(this.games.values());
    }

    updateGame(game: Game): void {
        this.games.set(game.id, game);
        if (game.passcode) {
            this.games.set(game.passcode, game);
        }
    }

    // --------------------------------------------------------------------------------
    // CHANGED: We set game.status = 'playing' immediately and call this.startNewRound
    // --------------------------------------------------------------------------------
    createGame(passcode: string, creator: Player): Game {
        if (!/^\d{4}$/.test(passcode)) {
            throw new Error('Passcode must be exactly 4 digits');
        }
    
        if (this.games.has(passcode)) {
            throw new Error('A game with this passcode already exists');
        }
    
        const game: Game = {
            id: Math.random().toString(36).substring(2, 15),
            passcode,
            players: [
                {
                    ...creator,
                    id: creator.id,
                    connected: true,
                    score: 0,
                },
            ],
            status: 'waiting',         // <<< "waiting" so others can join
            createdAt: new Date(),
            currentRound: 0,
            totalRounds: 5,
            roundTime: 60,
            votingTime: 30,
        };
    
        // Store in the map by both passcode and id
        this.games.set(passcode, game);
        this.games.set(game.id, game);
    
        // Do NOT call startNewRound here. We wait until the host is ready.
    
        return game;
    }

    startGame(passcode: string): void {
        const game = this.getGame(passcode);
        if (!game) {
            throw new Error('Game not found');
        }
        if (game.status !== 'waiting') {
            throw new Error('Game has already started or is finished.');
        }
    
        console.log(`Starting game ${game.id} (${passcode})...`);
    
        // ✅ Switch to "playing"
        game.status = 'playing';
        this.updateGame(game);
    
        console.log(`Game ${game.id} status updated to 'playing'. Starting first round...`);
    
        // ✅ Start the first round
        this.startNewRound(game.id);
    }
    
    
    

    joinGame(passcode: string, player: Player): Game {
        const game = this.getGame(passcode);
        if (!game) {
            throw new Error('Game not found');
        }   
    
        // Only allow joining if "waiting"
        if (game.status !== 'waiting') {
            throw new Error('Game has already started');
        }
    
        // Could also do size checks, etc.
        if (game.players.length >= 10) {
            throw new Error('Game is full');
        }
    
        // Check if this user is already in
        if (game.players.some((p) => p.userId === player.userId)) {
            throw new Error('Player already in game');
        }
    
        game.players.push({
            ...player,
            score: 0,
            hasSubmitted: false,
            hasVoted: false,
        });
    
        this.updateGame(game);
        return game;
    }
    
    

    submitMeme(gameId: string, playerId: string, captions: string[]) {
        const game = this.getGameById(gameId);
        if (!game) return { success: false, error: 'Game not found' };
    
        if (!game.round) {
            return { success: false, error: 'Round is missing' };
        }
    
        if (game.round.status !== 'submitting') {
            return { success: false, error: 'Not in submission phase' };
        }
    
        console.log('[🧠 DEBUG] playerId passed in:', playerId);
        console.log('[🧠 DEBUG] All player IDs in game:', game.players.map(p => p.id));
    
        const player = game.players.find(p => p.id === playerId);
        if (!player) {
            return { success: false, error: 'Player not found' };
        }
    
        if (player.hasSubmitted) {
            return { success: false, error: 'Already submitted' };
        }
    
        game.round.submissions.push({
            playerId,
            username: player.username,
            captions,
            votes: [],
        });
    
        player.hasSubmitted = true;
        console.log('👥 Submission status for all players:', game.players.map(p => ({
            id: p.id,
            hasSubmitted: p.hasSubmitted
        })));
    
        this.updateGame(game);
    
        const template = game.round.memeTemplate;
        const validSubmissions = game.round.submissions.filter(
            s => s.captions.filter(c => c.trim() !== '').length >= Math.ceil(template.captionFields / 2)
        );
    
        console.log("🎯 Valid submissions:", validSubmissions.map(s => s.username));
        console.log("🧑‍🤝‍🧑 All players submitted:", game.players.every(p => p.hasSubmitted));
    
        if (game.players.every(p => p.hasSubmitted) && validSubmissions.length > 0) {
            game.round.status = 'voting';
            game.round.timeLeft = game.votingTime;
    
            game.players.forEach((player) => {
                player.socket.emit('game_state', {
                    currentRound: game.currentRound,
                    totalRounds: game.totalRounds,
                    round: game.round,
                    memeTemplate: game.round!.memeTemplate,
                    submissions: game.round!.submissions,
                    players: game.players.map(p => ({
                        id: p.id,
                        username: p.username,
                        score: p.score,
                        connected: p.connected,
                        hasSubmitted: p.hasSubmitted,
                        hasVoted: p.hasVoted
                    }))
                });
    
                const playerValidSubmissions = game.round!.submissions.filter(s =>
                    s.playerId !== player.id &&
                    s.captions.filter(c => c.trim() !== '').length >= Math.ceil(template.captionFields / 2)
                );
    
                //const first = playerValidSubmissions[0];
                const first = validSubmissions[0];
                console.log("🧠 Valid submissions for", player.username, ":", playerValidSubmissions);
                console.log("🧠 Emitting voting_submission for player", player.username, "with submission:", first);
    
                if (first) {
                    console.log(`📤 Emitting to ${player.username}:`);
                    player.socket.emit('voting_submission', {
                        template: game.round!.memeTemplate,
                        submission: {
                            id: first.playerId,
                            username: first.username,
                            captions: first.captions,
                        }
                    });
                } else {
                    console.log("⚠️ No valid submissions found for", player.username);
                    player.hasVoted = true;
                    player.socket.emit('voting_complete');
                }
            });
    
            this.updateGame(game);
        }
    
        return { success: true, game };
    }
    
    submitVote(
        gameId: string,
        voterId: string,
        submissionPlayerId: string
    ): { success: boolean; error?: string; game?: Game } {
        const game = this.getGameById(gameId);
        if (!game || !game.round) {
            return { success: false, error: 'Game or round not found' };
        }
    
        if (game.round.status !== 'voting') {
            return { success: false, error: 'Not in voting phase' };
        }
    
        const voter = game.players.find((p) => p.id === voterId);
        if (!voter) {
            return { success: false, error: 'Voter not found' };
        }
    
        const submission = game.round.submissions.find(
            (s) => s.playerId === submissionPlayerId
        );
        console.log("🗳️ Vote button clicked:", submission ? "Like" : "Pass");
    
        if (!submission) {
            return { success: false, error: 'Submission not found' };
        }
    
        submission.votes.push(voterId);
        voter.currentVoteIndex = (voter.currentVoteIndex || 0) + 1;
    
        const template = game.round.memeTemplate;
        const validSubmissions = game.round.submissions.filter(s =>
            s.playerId !== voter.id &&
            s.captions.filter(c => c.trim() !== '').length >= Math.ceil(template.captionFields / 2) &&
            !s.votes.includes(voter.id)
        );
    
        const next = validSubmissions[0];
    
        if (next) {
            voter.socket.emit('voting_submission', {
                submission: {
                    playerId: next.playerId,
                    username: next.username,
                    captions: next.captions,
                },
                template: game.round.memeTemplate,
            });
        } else {
            voter.hasVoted = true;
            voter.socket.emit('voting_complete');
        }
    
        if (game.players.every(p => p.hasVoted)) {
            this.endRound(game);
        }
    
        this.updateGame(game);
        return { success: true, game };
    }
    
    getNextVotableSubmission(game: Game, player: Player): MemeSubmission | null {
        if (!game.round) return null;
    
        const submissions = game.round.submissions;
        const template = game.round.memeTemplate;
        const validSubmissions = submissions.filter(s =>
            s.playerId !== player.id &&
            s.captions.filter(c => c.trim() !== '').length >= Math.ceil(template.captionFields / 2)
        );
    
        let index = player.currentVoteIndex || 0;
    
        while (index < validSubmissions.length) {
            const submission = validSubmissions[index];
            if (!submission.votes.includes(player.id)) {
                player.currentVoteIndex = index;
                return submission;
            }
            index++;
        }
    
        return null;
    }
    
    
    

    startNewRound(gameId: string): void {
        const game = this.getGameById(gameId);
        if (!game) throw new Error('Game not found');
    
        console.log(`🛠️ Starting new round in game ${gameId}...`);
    
        game.currentRound++;
    
        // Ensure game.round is initialized
        if (!game.round) {
            console.log(`⚠️ Game ${gameId} has no round data. Initializing a new round.`);
            game.round = {
                memeTemplate: { id: '', url: '', captionFields: 0 }, // Default placeholder values
                submissions: [],
                status: 'submitting',
                timeLeft: game.roundTime,
            };
        }
    
        // ✅ Select a random meme template
        const template = this.memeTemplates[Math.floor(Math.random() * this.memeTemplates.length)];
        console.log(`🎭 Selected meme template for round: ${template.url}`);
    
        game.round.memeTemplate = template;
        game.round.submissions = [];
        game.round.status = 'submitting';
        game.round.timeLeft = game.roundTime;
    
        // Reset player submission/voting status
        game.players.forEach((player) => {
            player.hasSubmitted = false;
            player.hasVoted = false;
            player.currentVoteIndex = 0; // NEW
        });
    
        console.log(`🚀 Game ${gameId} is now in 'submitting' phase.`);
    
        this.updateGame(game);
    
        // ✅ Emit full game state to all clients
        game.players.forEach((player) => {
            console.log(`📡 Sending 'game_state' update to player ${player.username}`);
            player.socket.emit('game_state', {
                currentRound: game.currentRound,
                totalRounds: game.totalRounds,
                round: game.round,
                memeTemplate: game.round?.memeTemplate,
                submissions: game.round?.submissions || [], // ✅ Added this line
                players: game.players.map((p: Player) => ({
                    id: p.id,
                    username: p.username,
                    score: p.score,
                    connected: p.connected,
                    hasSubmitted: p.hasSubmitted,
                    hasVoted: p.hasVoted
                }))
            });
        });
    
        this.startTimer(game);
    }
    
    
    

    private endRound(game: Game): void {
        if (!game.round) return;

        // Calculate scores for each submission
        game.round.submissions.forEach((submission) => {
            const player = game.players.find(
                (p) => p.id === submission.playerId
            );
            if (player) {
                const isFirstSubmission =
                    game.round!.submissions[0].playerId === player.id;
                const wasLastPlace = game.players.every(
                    (p) => p.id === player.id || p.score > player.score
                );
                const winStreak = this.calculateWinStreak(game, player.id);

                const scoreResult = ScoringSystem.calculateScore(
                    submission,
                    game.players.length,
                    isFirstSubmission,
                    wasLastPlace,
                    winStreak
                );

                player.score += scoreResult.points;

                // Emit scoring details to the player
                player.socket.emit('score_update', {
                    points: scoreResult.points,
                    bonuses: scoreResult.bonuses,
                    totalScore: player.score,
                });
            }
        });

        game.round.status = 'results';

        // Check if game is over
        if (!game.round) return;
        if (game.currentRound >= game.totalRounds) {
            game.status = 'finished';
            const rankings = ScoringSystem.calculateFinalRankings(
                game.players.map((p) => ({
                    id: p.id,
                    score: p.score,
                    username: p.username,
                }))
            );

            const winner = rankings[0];
            game.winner = {
                userId: game.players.find((p) => p.id === winner.id)?.userId,
                username: winner.username,
                score: winner.score,
            };

            // Send final rankings to all players
            game.players.forEach((player) => {
                player.socket.emit('game_rankings', { rankings });
            });
        }

        this.updateGame(game);
    }

    private calculateWinStreak(game: Game, playerId: string): number {
        let streak = 0;
        for (let round = game.currentRound; round > 0; round--) {
            const roundWinner = this.getRoundWinner(game, round);
            if (roundWinner?.id === playerId) {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    }

    private getRoundWinner(game: Game, roundNumber: number): Player | null {
        if (!game.round || game.currentRound !== roundNumber) return null;

        const submissions = game.round.submissions;
        if (submissions.length === 0) return null;

        const winningSubmission = submissions.reduce((prev, current) =>
            current.votes.length > prev.votes.length ? current : prev
        );

        return (
            game.players.find((p) => p.id === winningSubmission.playerId) ||
            null
        );
    }

    private startTimer(game: Game): void {
        this.clearTimer(game.id);
    
        const timer = setInterval(() => {
            const currentGame = this.getGameById(game.id);
            if (!currentGame || !currentGame.round) {
                this.clearTimer(game.id);
                return;
            }
    
            currentGame.round.timeLeft--;
    
            // Send timer update
            currentGame.players.forEach((player: Player) => {
                player.socket.emit('time_update', {
                    timeLeft: currentGame.round!.timeLeft,
                    phase: currentGame.round!.status,
                });
            });
    
            // Time's up
            if (currentGame.round.timeLeft <= 0) {
                if (currentGame.round.status === 'submitting') {
                    currentGame.round.status = 'voting';
                    currentGame.round.timeLeft = currentGame.votingTime;
    
                    // Auto-submit blank memes
                    currentGame.players.forEach((player) => {
                        if (!player.hasSubmitted) {
                            this.submitMeme(currentGame.id, player.id, ['[No submission]']);
                        }
                    });
    
                    // Set voting index and send first meme (not their own)
                    currentGame.players.forEach((player) => {
                        player.currentVoteIndex = 0;
                        const next = currentGame.round!.submissions.find(
                            (s) => s.playerId !== player.id
                        );
                        if (next) {

                            player.socket.emit('voting_submission', {
                                template: currentGame.round!.memeTemplate,
                                submission: {
                                    playerId: next.playerId, // ✅ CORRECTED
                                    username: next.username,
                                    captions: next.captions,
                                },
                            });
                        } else {
                            player.hasVoted = true;
                            player.socket.emit('voting_complete');
                        }
                    });
                } else if (currentGame.round.status === 'voting') {
                    this.endRound(currentGame);
                }
            }
    
            this.updateGame(currentGame);
        }, 1000);
    
        this.timers.set(game.id, timer);
    }
    

    private clearTimer(gameId: string): void {
        const timer = this.timers.get(gameId);
        if (timer) {
            clearInterval(timer);
            this.timers.delete(gameId);
        }
    }

    private cleanupGame(gameId: string): void {
        this.clearTimer(gameId);

        const game = this.getGameById(gameId);
        if (!game) return;

        // Notify all players the game is ending
        game.players.forEach((player) => {
            player.socket.emit('game_cleanup', {
                message: 'Game session ended',
                gameId: game.id,
            });
        });

        // Remove game from storage
        this.games.delete(game.id);
        if (game.passcode) {
            this.games.delete(game.passcode);
        }
    }

    handlePlayerDisconnect(gameId: string, playerId: string): void {
        const game = this.getGameById(gameId);
        if (!game) return;

        const player = game.players.find((p) => p.id === playerId);
        if (!player) return;

        player.connected = false;

        // Notify other players about the disconnection
        game.players.forEach((p) => {
            if (p.id !== playerId) {
                p.socket.emit('player_disconnected', {
                    playerId,
                    username: player.username,
                });
            }
        });

        // Check if all players are disconnected
        const allDisconnected = game.players.every((p) => !p.connected);
        if (allDisconnected) {
            this.cleanupGame(gameId);
        } else {
            this.updateGame(game);
        }
    }

    handlePlayerReconnect(
        gameId: string,
        playerId: string,
        socket: Socket
    ): void {
        const game = this.getGameById(gameId);
        if (!game) return;

        const player = game.players.find((p) => p.id === playerId);
        if (!player) return;

        player.connected = true;
        player.socket = socket;

        // Send current game state to reconnected player
        if (game.round) {
            socket.emit('game_state', {
                currentRound: game.currentRound,
                totalRounds: game.totalRounds,
                round: game.round,
                memeTemplate: game.round?.memeTemplate,
                submissions: game.round?.submissions || [], // ✅ Added this line
                players: game.players.map((p: Player) => ({
                    id: p.id,
                    username: p.username,
                    score: p.score,
                    connected: p.connected,
                    hasSubmitted: p.hasSubmitted,
                    hasVoted: p.hasVoted
                }))
            });
        }

        // Notify other players about the reconnection
        game.players.forEach((p) => {
            if (p.id !== playerId) {
                p.socket.emit('player_reconnected', {
                    playerId,
                    username: player.username,
                });
            }
        });

        this.updateGame(game);
    }

    createRematch(game: Game): Game {
        const newGame = this.createGame(
            Math.floor(1000 + Math.random() * 9000).toString(),
            game.players[0]
        );

        // Add the rest of the players
        for (let i = 1; i < game.players.length; i++) {
            this.joinGame(newGame.passcode, game.players[i]);
        }

        return newGame;
    }

    private serializeGame(game: Game): string {
        const serializedGame = {
            ...game,
            players: game.players.map((player) => ({
                ...player,
                socket: undefined, // remove socket instance
            })),
        };
        return JSON.stringify(serializedGame);
    }

    private deserializeGame(
        gameData: string,
        sockets: Map<string, Socket>
    ): Game {
        const parsedGame = JSON.parse(gameData);

        const game = {
            ...parsedGame,
            players: parsedGame.players.map((player: Omit<Player, 'socket'>) => ({
                ...player,
                socket: sockets.get(player.id) || null,
            })),
        };

        return game;
    }

    async saveGameState(gameId: string): Promise<void> {
        const game = this.getGameById(gameId);
        if (!game) return;

        try {
            const serializedGame = this.serializeGame(game);
            await pool.query(
                `INSERT INTO game_states (game_id, state_data, created_at)
                 VALUES ($1, $2, CURRENT_TIMESTAMP)
                 ON CONFLICT (game_id) 
                 DO UPDATE SET state_data = $2, updated_at = CURRENT_TIMESTAMP`,
                [gameId, serializedGame]
            );
        } catch (error) {
            console.error('Failed to save game state:', error);
        }
    }

    async loadGameState(
        gameId: string,
        sockets: Map<string, Socket>
    ): Promise<Game | null> {
        try {
            const result = await pool.query(
                'SELECT state_data FROM game_states WHERE game_id = $1',
                [gameId]
            );

            if (result.rows.length === 0) return null;

            return this.deserializeGame(result.rows[0].state_data, sockets);
        } catch (error) {
            console.error('Failed to load game state:', error);
            return null;
        }
    }

    private async saveGameStatistics(game: Game): Promise<void> {
        if (game.status !== 'finished' || !game.winner) return;

        try {
            await pool.query('BEGIN');

            // Update player statistics
            for (const player of game.players) {
                const isWinner = player.userId === game.winner.userId;
                await pool.query(
                    `INSERT INTO player_statistics 
                     (user_id, games_played, games_won, total_points, highest_score)
                     VALUES ($1, 1, $2, $3, $4)
                     ON CONFLICT (user_id)
                     DO UPDATE SET
                        games_played = player_statistics.games_played + 1,
                        games_won = player_statistics.games_won + $2,
                        total_points = player_statistics.total_points + $3,
                        highest_score = GREATEST(player_statistics.highest_score, $4)`,
                    [player.userId, isWinner ? 1 : 0, player.score, player.score]
                );
            }

            // Save game result
            await pool.query(
                `INSERT INTO game_results
                 (game_id, winner_id, total_rounds, duration_seconds, player_count)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    game.id,
                    game.winner.userId,
                    game.totalRounds,
                    Math.floor(
                        (Date.now() - game.createdAt.getTime()) / 1000
                    ),
                    game.players.length,
                ]
            );

            await pool.query('COMMIT');
        } catch (error) {
            await pool.query('ROLLBACK');
            console.error('Failed to save game statistics:', error);
        }
    }

    private async getPlayerStatistics(userId: number): Promise<any> {
        try {
            const result = await pool.query(
                `SELECT 
                    games_played,
                    games_won,
                    total_points,
                    highest_score,
                    ROUND(CAST(games_won AS DECIMAL) / NULLIF(games_played, 0) * 100, 2) as win_rate
                 FROM player_statistics
                 WHERE user_id = $1`,
                [userId]
            );

            return result.rows[0] || null;
        } catch (error) {
            console.error('Failed to get player statistics:', error);
            return null;
        }
    }

    private async getLeaderboard(limit: number = 10): Promise<any[]> {
        try {
            const result = await pool.query(
                `SELECT 
                    u.username,
                    ps.games_played,
                    ps.games_won,
                    ps.total_points,
                    ps.highest_score,
                    ROUND(CAST(ps.games_won AS DECIMAL) / NULLIF(ps.games_played, 0) * 100, 2) as win_rate
                 FROM player_statistics ps
                 JOIN users u ON u.id = ps.user_id
                 ORDER BY ps.total_points DESC, ps.games_won DESC
                 LIMIT $1`,
                [limit]
            );

            return result.rows;
        } catch (error) {
            console.error('Failed to get leaderboard:', error);
            return [];
        }
    }
}

export const gamesService = GamesService.getInstance();
