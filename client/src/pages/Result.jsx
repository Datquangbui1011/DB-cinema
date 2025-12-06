import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { toast } from 'react-hot-toast';

const Result = () => {
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id');
    const { axios, getToken } = useAppContext();
    const [isSuccess, setIsSuccess] = useState(null);

    useEffect(() => {
        const verifyPayment = async () => {
            if (sessionId) {
                try {
                    const token = await getToken();
                    const { data } = await axios.post('/api/booking/verify', { sessionId }, {
                        headers: { Authorization: `Bearer ${token}` }
                    });

                    if (data.success) {
                        setIsSuccess(true);
                        toast.success(data.message);
                    } else {
                        setIsSuccess(false);
                        toast.error(data.message);
                    }
                } catch (error) {
                    console.log(error);
                    setIsSuccess(false);
                    toast.error("Payment verification failed");
                }
            }
        };

        verifyPayment();
    }, [sessionId]);

    return (
        <div className='min-h-[60vh] flex flex-col items-center justify-center gap-5 text-white pt-32'>
            {isSuccess === null ? (
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            ) : isSuccess ? (
                <>
                    <h2 className='text-3xl font-bold text-green-500'>Payment Successful!</h2>
                    <p className='text-gray-300'>Your booking has been confirmed.</p>
                    <Link to="/my-bookings" className="px-8 py-3 bg-primary rounded-full font-semibold mt-4 hover:bg-primary-dull transition">
                        View My Bookings
                    </Link>
                </>
            ) : (
                <>
                    <h2 className='text-3xl font-bold text-red-500'>Payment Failed</h2>
                    <p className='text-gray-300'>Something went wrong with your payment.</p>
                    <Link to="/" className="px-8 py-3 bg-gray-600 rounded-full font-semibold mt-4 hover:bg-gray-500 transition">
                        Go Home
                    </Link>
                </>
            )}
        </div>
    );
};

export default Result;
