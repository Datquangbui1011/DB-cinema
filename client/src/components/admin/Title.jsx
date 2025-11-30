import React from 'react';
import { assets } from '../../assets/assets';
const Title = ({ text1, text2 }) => {
    return (
        <div>
            <h1 className="text-2xl font-bold">
                {text1} <span className="underline text-primary">
                    {text2}</span>
            </h1>
        </div>
    );
};

export default Title;