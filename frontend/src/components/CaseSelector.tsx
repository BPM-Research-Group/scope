import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '~/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { cn } from '~/lib/tailwind';

interface CaseSelectorProps {
    caseCount: number;
    selectedCaseIndex?: number;
    onSelect: (index: number) => void;
}

export function CaseSelector({ caseCount, selectedCaseIndex, onSelect }: CaseSelectorProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [scrollTop, setScrollTop] = useState(0);
    const listRef = useRef<React.ElementRef<typeof CommandList>>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [triggerWidth, setTriggerWidth] = useState<number | undefined>(undefined);

    // Filter indices based on search
    const filteredIndices = useMemo(() => {
        if (!search) {
            return Array.from({ length: caseCount }, (_, i) => i);
        }
        const lowerSearch = search.toLowerCase();
        const indices: number[] = [];
        for (let i = 0; i < caseCount; i++) {
            const label = `Case ${i + 1}`;
            if (label.toLowerCase().includes(lowerSearch)) {
                indices.push(i);
            }
        }
        return indices;
    }, [caseCount, search]);

    const ITEM_HEIGHT = 32;
    const VISIBLE_HEIGHT = 300;
    const BUFFER = 5;

    const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER);
    const endIndex = Math.min(filteredIndices.length, Math.ceil((scrollTop + VISIBLE_HEIGHT) / ITEM_HEIGHT) + BUFFER);

    const visibleIndices = filteredIndices.slice(startIndex, endIndex);
    const totalHeight = filteredIndices.length * ITEM_HEIGHT;

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    };

    useEffect(() => {
        if (triggerRef.current) {
            setTriggerWidth(triggerRef.current.offsetWidth);
        }
    }, [open]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    ref={triggerRef}
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                >
                    {selectedCaseIndex !== undefined ? `Case ${selectedCaseIndex + 1}` : 'Select Case...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0" style={{ width: triggerWidth ? `${triggerWidth}px` : 'auto' }}>
                <Command shouldFilter={false}>
                    <CommandInput placeholder="Search case..." value={search} onValueChange={setSearch} />
                    <CommandList ref={listRef} className="max-h-[300px] overflow-y-auto" onScroll={handleScroll}>
                        {filteredIndices.length === 0 && <CommandEmpty>No case found.</CommandEmpty>}
                        <div
                            style={{
                                height: `${totalHeight}px`,
                                position: 'relative',
                            }}
                        >
                            {visibleIndices.map((originalIndex, i) => (
                                <CommandItem
                                    key={originalIndex}
                                    value={`Case ${originalIndex + 1}`}
                                    onSelect={() => {
                                        onSelect(originalIndex);
                                        setOpen(false);
                                    }}
                                    className="absolute w-full"
                                    style={{
                                        height: `${ITEM_HEIGHT}px`,
                                        top: `${(startIndex + i) * ITEM_HEIGHT}px`,
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            'mr-2 h-4 w-4',
                                            selectedCaseIndex === originalIndex ? 'opacity-100' : 'opacity-0'
                                        )}
                                    />
                                    Case {originalIndex + 1}
                                </CommandItem>
                            ))}
                        </div>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
