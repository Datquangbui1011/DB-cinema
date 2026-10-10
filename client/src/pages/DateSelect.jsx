import React from 'react'
import { ChevronLeftIcon, ChevronRightIcon, Tag } from 'lucide-react'
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

const DateSelect = ({ dateTime, id }) => {
    const navigate = useNavigate();
    const [selected, setSelected] = useState(null);
    const onBookHandler = () => {
        if (!selected) {
            return toast('Please select a date')
        }
        navigate(`/seat-layout/${id}/${selected}`)
        scrollTo(0, 0)
    }

    return (
        <div id='dateSelect' className='pt-30'>
            <div className='flex flex-col md:flex-row items-center justify-between gap-10 relative p-8 bg-primary/10 border border-primary/20 rounded-lg'>
                <div>
                    <p className='text-lg font-semibold'>
                        SELECT DATE
                    </p>
                    <div className='flex items-center gap-6 text-sm mt-5'>
                        <ChevronLeftIcon width={28} />
                        <span className='grid grid-cols-2 md:flex flex-wrap md:max-w-lg gap-4'>
                            {Object.keys(dateTime).sort((a, b) => new Date(a) - new Date(b)).map((date) => (
                                <button onClick={() => setSelected(date)} key={date} title={dateTime[date].some(s => s.promotion) ? 'Discounted showtimes this day' : undefined} className={`relative flex flex-col items-center justify-center h-14 w-14 aspect-square rounded cursor-pointer ${selected === date ? "bg-primary text-white" : " border border-primary/70"}`}>
                                    {dateTime[date].some(s => s.promotion) && (
                                        <span className='absolute -top-2 -right-2 inline-flex items-center gap-0.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white'>
                                            <Tag className='w-2.5 h-2.5' />Deal
                                        </span>
                                    )}
                                    <span>
                                        {new Date(`${date}T00:00:00`).getDate()}
                                    </span>
                                    <span>
                                        {new Date(`${date}T00:00:00`).toLocaleString('en-us', { month: 'short' })}
                                    </span>
                                </button>
                            ))}

                        </span>
                        <ChevronRightIcon width={28} />
                    </div>
                </div>
                <button onClick={onBookHandler} className='bg-primary text-white px-8 py-2 mt-6 rounded hover:bg-primary/90 transition-all cursor-pointer'> Book Now</button>
            </div>

        </div>
    )
}

export default DateSelect   