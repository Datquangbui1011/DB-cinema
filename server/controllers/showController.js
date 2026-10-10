import axios from 'axios';
import Show from '../models/Show.js';
import Movie from '../models/Movie.js';
import Screen from '../models/Screen.js';
import { toCinemaDate, zonedTimeToUtc } from "../configs/cinemaTime.js";
import { findScreenConflicts, conflictMessage } from "../services/showConflicts.js";
import { activePromotion } from '../advisor/promotions.js';

const DEFAULT_RUNTIME = 120;

//Api to get now playing movies from TMDB
export const getNowPlayingMovies = async (req, res) => {
    try {
        const { data } = await axios.get('https://api.themoviedb.org/3/movie/now_playing', {
            headers: {
                Authorization: `Bearer ${process.env.TMDB_API_KEY}`
            }
        })
        const baseImage = 'https://image.tmdb.org/t/p/original';
        const movies = (data.results || []).map(m => ({
            // provide a mongo-like _id for client code that expects it
            _id: m.id ? String(m.id) : undefined,
            id: m.id,
            title: m.title,
            overview: m.overview,
            poster_path: m.poster_path ? `${baseImage}${m.poster_path}` : null,
            backdrop_path: m.backdrop_path ? `${baseImage}${m.backdrop_path}` : null,
            release_date: m.release_date,
            original_language: m.original_language,
            vote_average: m.vote_average,
            vote_count: m.vote_count,
            genres: m.genre_ids || [],
        }));
        return res.json({ success: true, movies })
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'Something went wrong. Please try again.' })
    }
}


//Api to add new show  to DB
export const addShow = async (req, res) => {
    try {
        const { movieId, showInput, showPrice, screenId } = req.body;

        const screen = await Screen.findById(screenId).lean();
        if (!screen || !screen.active) {
            return res.json({ success: false, message: 'Please choose a valid screen' });
        }

        let movie = await Movie.findById(movieId);
        if (!movie) {
            const [movieDetailsResponse, movieCreditsResponse, movieVideosResponse] = await Promise.all([
                axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
                    headers: {
                        Authorization: `Bearer ${process.env.TMDB_API_KEY}`
                    }
                }),

                axios.get(`https://api.themoviedb.org/3/movie/${movieId}/credits`, {
                    headers: {
                        Authorization: `Bearer ${process.env.TMDB_API_KEY}`
                    }
                }),

                axios.get(`https://api.themoviedb.org/3/movie/${movieId}/videos`, {
                    headers: {
                        Authorization: `Bearer ${process.env.TMDB_API_KEY}`
                    }
                })
            ]);

            const movieApiData = movieDetailsResponse.data;
            const movieCreditsData = movieCreditsResponse.data;
            const movieVideosData = movieVideosResponse.data;

            const trailer = movieVideosData.results.find(video => video.type === 'Trailer' && video.site === 'YouTube');

            const movieData = {
                _id: movieId,
                title: movieApiData.title,
                overview: movieApiData.overview,
                poster_path: movieApiData.poster_path,
                backdrop_path: movieApiData.backdrop_path,
                trailer_path: trailer ? trailer.key : "",
                release_date: movieApiData.release_date,
                original_language: movieApiData.original_language,
                tagline: movieApiData.tagline,
                genres: movieApiData.genres,
                casts: movieCreditsData.cast,
                vote_average: movieApiData.vote_average,
                runtime: movieApiData.runtime,
            }

            //Add movie to DB
            movie = await Movie.create(movieData);
        }

        // showInput is an array: [{ date: 'YYYY-MM-DD', time: ['HH:MM', ...] }] in cinema-local time
        const starts = showInput.flatMap(show => show.time.map(time => zonedTimeToUtc(show.date, time)));
        if (starts.length === 0) {
            return res.json({ success: false, message: 'Add at least one showtime' });
        }

        const conflicts = await findScreenConflicts(screen._id, starts, movie.runtime || DEFAULT_RUNTIME);
        if (conflicts.length > 0) {
            return res.json({ success: false, message: conflictMessage(screen.name, conflicts), conflicts: conflicts.length });
        }

        await Show.insertMany(starts.map(showDateTime => ({
            movie: movieId,
            showDateTime,
            showPrice,
            theaterType: screen.theaterType,
            screen: screen._id,
            occupiedSeats: {},
        })));
        res.json({ success: true, message: `${starts.length} show${starts.length === 1 ? '' : 's'} added to ${screen.name}` })

    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message })
    }
}

//Api to get all shows from DB
export const getShows = async (req, res) => {
    try {
        const shows = await Show.find({ showDateTime: { $gte: new Date() } }).populate('movie').sort({ showDateTime: 1 });

        // Create a map of movie ID to movie object to ensure uniqueness
        const uniqueMoviesMap = new Map();
        shows.forEach(show => {
            if (show.movie && !uniqueMoviesMap.has(show.movie._id.toString())) {
                uniqueMoviesMap.set(show.movie._id.toString(), show.movie);
            }
        });

        res.json({ success: true, shows: Array.from(uniqueMoviesMap.values()) })
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'Something went wrong. Please try again.' })
    }
}

//API to get  a  single show from DB
export const getShow = async (req, res) => {
    try {
        const { movieId } = req.params;
        const shows = await Show.find({ movie: movieId, showDateTime: { $gte: new Date() } }).populate('screen', 'name');

        let movie = await Movie.findById(movieId);

        if (movie && !movie.trailer_path) {
            const { data } = await axios.get(`https://api.themoviedb.org/3/movie/${movieId}/videos`, {
                headers: {
                    Authorization: `Bearer ${process.env.TMDB_API_KEY}`
                }
            })
            const trailer = data.results.find(video => video.type === 'Trailer' && video.site === 'YouTube');
            if (trailer) {
                movie.trailer_path = trailer.key;
                await movie.save();
            }
        }
        const dateTime = {};

        shows.forEach(show => {
            const date = toCinemaDate(show.showDateTime);
            if (!dateTime[date]) {
                dateTime[date] = [];
            }
            dateTime[date].push({ time: show.showDateTime, showId: show._id, theaterType: show.theaterType, screenName: show.screen?.name || null, showPrice: show.showPrice, promotion: activePromotion(show) });
        })
        res.json({ success: true, movie, dateTime })
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'Something went wrong. Please try again.' })
    }
}

